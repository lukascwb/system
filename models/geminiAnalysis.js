const { GoogleGenerativeAI } = require('@google/generative-ai');

async function analyzeProduct(keepaTitle, keepaAvgOffer, shoppingResultsJson) {
    try {
        const shoppingResults = JSON.parse(shoppingResultsJson);

        const dataForGemini = {
            keepaTitle,
            keepaAvgOffer: parseFloat(keepaAvgOffer),
            shoppingResults,
        };

        const analysisResult = await generateGeminiAnalysis(dataForGemini);
        return analysisResult;

    } catch (error) {
        console.error('Error during product analysis:', error);
        if (error.response) {
            //The request was made and the server responded with a status code
            //that falls out of the range of 2xx
            console.error('Data:', error.response.data);
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
        } else if (error.request) {
            //The request was made but no response was received
            //`error.request` is an instance of XMLHttpRequest in the browser and an instance of
            //http.ClientRequest in node.js
            console.error(error.request);
        } else {
            //Something happened in setting up the request that triggered an Error
            console.error('Error', error.message);
        }
        throw error;
    }
}

async function generateGeminiAnalysis(dataForGemini) {
    try {
        const { keepaTitle, keepaAvgOffer, shoppingResults } = dataForGemini;
        const formattedShoppingResults = JSON.stringify(shoppingResults, null, 2);

        const prompt = `Analyze resale profitability:

Product Title (from Keepa): ${keepaTitle}
Average Offer Price (from Keepa): $${keepaAvgOffer}
Shopping Results (JSON):
${formattedShoppingResults}

Instructions:

For each product in the shopping results:
1. Check if "seller" is in your list of nearby stores (Walmart, Target, BJ's Wholesale Club, Costco, CVS Pharmacy, Dollar General, Office Depot, Party City, Sam's Club, Shaw's, Staples, Stop & Shop, Walgreens.com, REI, DICK'S Sporting Goods, Ace Hardware, Cabela's).
2. Calculate profit: Average Offer Price - (Product Price + $5 shipping + fees (8% if Product Price < $14.99, otherwise 15%))
3. Calculate ROI: (Profit / Product Price) * 100
4. Output as JSON array:  [{ "title": "...", "seller": "...", "price": ..., "nearby": true/false, "profit": ..., "roi": ... }]`;


        const API_KEY = process.env.GOOGLE_API_KEY; //Get API Key from environment variables
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

        const requestData = {
            contents: [
                {
                    role: 'user',
                    content: prompt, //Use 'content' here
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
                topP: 0.95,
                topK: 40,
                responseMimeType: 'text/plain'
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API request failed with status ${response.status}: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        return data.candidates[0].content; // Access the generated text

    } catch (error) {
        console.error("Error generating Gemini analysis:", error);
        throw error;
    }
}

async function analyzeTitles(keepaTitle, productTitle) {
    try {
        // First, do a quick rule-based check for obvious matches
        const ruleBasedResult = quickRuleBasedMatch(keepaTitle, productTitle);
        if (ruleBasedResult.status === "Aprovado") {
            console.log('Rule-based match found - skipping AI analysis');
            return ruleBasedResult;
        }
        
        // If rule-based check fails, use AI for more complex analysis
        console.log('Rule-based check failed - using AI analysis');
        
        const prompt = `Analise se os dois títulos de produtos se referem ao EXATO mesmo produto:

Título do Keepa: "${keepaTitle}"
Título do Produto: "${productTitle}"

REGRAS RIGOROSAS PARA APROVAÇÃO:

APROVE APENAS se TODOS os critérios forem atendidos EXATAMENTE:
1. MESMA MARCA (exato match, incluindo variações de escrita)
2. MESMO NOME/MODELO PRINCIPAL (exato match)
3. MESMA CONCENTRAÇÃO/POTÊNCIA (se aplicável)
4. MESMO TAMANHO/QUANTIDADE (exato match, incluindo unidades)
5. MESMA FORMA/APRESENTAÇÃO (líquido, cápsula, pó, shake, etc.)
6. MESMAS ESPECIFICAÇÕES TÉCNICAS (se aplicável)
7. MESMOS INGREDIENTES PRINCIPAIS (se especificados)
8. MESMA EMBALAGEM/QUANTIDADE POR PACOTE

EXEMPLOS DE REPROVAÇÃO:
- "Slimfast High Protein Ready to Drink Creamy Chocolate 11oz 12ct" vs "Nutrition Plan High Protein Chocolate 30g Shake 11.5fl.oz 12 Pack" → REPROVADO (marcas diferentes: Slimfast vs Nutrition Plan)
- "Energy Boost 70 Fulvic Minerals" vs "Energy Boost 70 Concentrate" → REPROVADO (diferentes especificações)
- "Vitamin C 1000mg 60 tablets" vs "Vitamin C 1000mg 120 tablets" → REPROVADO (quantidade diferente)
- "Protein Powder Vanilla 2lb" vs "Protein Powder Chocolate 2lb" → REPROVADO (sabor diferente)
- "Omega-3 1000mg Fish Oil" vs "Omega-3 1000mg Flaxseed Oil" → REPROVADO (fonte diferente)
- "Multivitamin Men 50+" vs "Multivitamin Women 50+" → REPROVADO (público-alvo diferente)
- "Protein Shake Chocolate 12oz" vs "Protein Shake Chocolate 16oz" → REPROVADO (tamanho diferente)
- "Organic Green Tea 100 bags" vs "Green Tea 100 bags" → REPROVADO (especificação diferente: orgânico vs não orgânico)

EXEMPLOS DE APROVAÇÃO:
- "Vitamin D3 2000IU 60 Softgels" vs "Vitamin D3 2000IU 60 Softgels" → APROVADO
- "Protein Powder Vanilla 2lb" vs "Protein Powder Vanilla 2lb" → APROVADO

IMPORTANTE: 
- "Slimfast" ≠ "Nutrition Plan" (marcas diferentes)
- "11oz" ≠ "11.5fl.oz" (tamanhos diferentes)
- "Ready to Drink" ≠ "Shake" (formatos diferentes)
- "Creamy Chocolate" ≠ "Chocolate" (especificações diferentes)

Responda APENAS com "Aprovado" ou "Reprovado|motivo" (exemplo: "Reprovado|Marca diferente" ou "Reprovado|Tamanho diferente").
O motivo deve ser objetivo e máximo 3 palavras.`;

        const API_KEY = process.env.GOOGLE_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

        const requestData = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: prompt
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 100,
                topP: 0.95,
                topK: 40
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API request failed with status ${response.status}: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        console.log('Gemini API Response:', JSON.stringify(data, null, 2));
        
        const result = data.candidates[0].content.parts[0].text.trim();
        console.log('Gemini Raw Result:', `"${result}"`);
        
        // Parse the result to extract status and reason
        let finalStatus, finalReason;
        if (result === "Aprovado") {
            finalStatus = "Aprovado";
            finalReason = null;
        } else if (result.includes("|")) {
            const parts = result.split("|");
            const reason = parts[1] ? parts[1].trim() : "Motivo não especificado";
            
            // Check if the reason is about size and if the product title doesn't specify size
            if (reason.toLowerCase().includes("tamanho") || reason.toLowerCase().includes("size")) {
                const keepaHasSize = hasSizeSpecification(keepaTitle);
                const productHasSize = hasSizeSpecification(productTitle);
                
                                 // If Keepa has size but product doesn't, mark as "Sem Tamanho"
                 if (keepaHasSize && !productHasSize) {
                     finalStatus = "Sem Tamanho";
                     finalReason = "Sem Tamanho";
                 } else {
                    finalStatus = "Reprovado";
                    finalReason = reason;
                }
            } else {
                finalStatus = "Reprovado";
                finalReason = reason;
            }
        } else {
            finalStatus = "Reprovado";
            finalReason = "Análise falhou";
        }
        
        console.log('Gemini Final Status:', finalStatus);
        console.log('Gemini Final Reason:', finalReason);
        
        return {
            status: finalStatus,
            reason: finalReason
        };

    } catch (error) {
        console.error("Error analyzing titles with Gemini:", error);
        return {
            status: "Reprovado",
            reason: "Erro na análise"
        };
    }
}

// Function to check if a title has size/weight specifications
function hasSizeSpecification(title) {
    if (!title) return false;
    
    // Common size/weight patterns
    const sizePatterns = [
        /\b\d+(?:\.\d+)?\s*(?:oz|ounce|ounces|fl\.?\s*oz|fl\.?\s*ounce|fl\.?\s*ounces)\b/gi,
        /\b\d+(?:\.\d+)?\s*(?:g|gram|grams)\b/gi,
        /\b\d+(?:\.\d+)?\s*(?:lb|lbs|pound|pounds)\b/gi,
        /\b\d+(?:\.\d+)?\s*(?:kg|kilogram|kilograms)\b/gi,
        /\b\d+(?:\.\d+)?\s*(?:ml|milliliter|milliliters)\b/gi,
        /\b\d+(?:\.\d+)?\s*(?:l|liter|liters)\b/gi,
        /\b\d+\s*(?:count|ct|pack|packs|piece|pieces|unit|units)\b/gi,
        /\b(?:family\s+size|party\s+size|large|medium|small|mini|regular)\b/gi,
        /\b\d+(?:\.\d+)?\s*(?:serving|servings)\b/gi
    ];
    
    return sizePatterns.some(pattern => pattern.test(title));
}

// Rule-based matching function for quick checks
function quickRuleBasedMatch(keepaTitle, productTitle) {
    if (!keepaTitle || !productTitle) {
        return { status: "Reprovado", reason: "Título vazio" };
    }
    
    // Normalize titles for comparison
    const normalizeTitle = (title) => {
        return title.toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Remove special characters
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
    };
    
    const keepaNormalized = normalizeTitle(keepaTitle);
    const productNormalized = normalizeTitle(productTitle);
    
    // Check for exact match (after normalization)
    if (keepaNormalized === productNormalized) {
        return { status: "Aprovado", reason: null };
    }
    
    // Check for high similarity (90%+ match)
    const similarity = calculateSimilarity(keepaNormalized, productNormalized);
    if (similarity >= 0.9) {
        return { status: "Aprovado", reason: null };
    }
    
    // Check for key brand and product matches
    const keepaWords = keepaNormalized.split(' ');
    const productWords = productNormalized.split(' ');
    
    // Extract brand (first word or common brands)
    const commonBrands = [
        'twix', 'snickers', 'mars', 'kit', 'kat', 'reeses', 'm&m', 'hershey', 'cadbury',
        'dove', 'milky', 'way', 'butterfinger', 'baby', 'ruth', 'almond', 'joy', 'mounds',
        'york', 'peppermint', 'patty', 'junior', 'mints', 'rolo', 'caramello', 'take', 'five',
        'unreal', 'lindt', 'ghirardelli', 'godiva', 'milka', 'ferrero', 'rocher',
        'toblerone', 'wrigley', 'haribo', 'skittles', 'starburst', 'jolly', 'rancher',
        'airheads', 'nerds', 'sour', 'patch', 'swedish', 'fish', 'gummy', 'bears',
        'worms', 'jelly', 'beans', 'mike', 'ike', 'partake', 'kindling', 'protein',
        'pretzels', 'graham', 'cracker', 'minis', 'vegan', 'special', 'k', 'rice',
        'krispies', 'frosted', 'flakes', 'corn', 'pops', 'lucky', 'charms', 'cinnamon',
        'toast', 'crunch', 'honey', 'nut', 'cheerios', 'wheaties', 'total', 'raisin',
        'bran', 'shredded', 'wheat', 'cocoa', 'puffs', 'trix', 'fruity', 'pebbles',
        'captain', 'crunch', 'life', 'cereal'
    ];
    
    // Find brand in both titles
    let keepaBrand = null;
    let productBrand = null;
    
    for (const word of keepaWords) {
        if (commonBrands.includes(word)) {
            keepaBrand = word;
            break;
        }
    }
    
    for (const word of productWords) {
        if (commonBrands.includes(word)) {
            productBrand = word;
            break;
        }
    }
    
    // If brands don't match, reject
    if (keepaBrand && productBrand && keepaBrand !== productBrand) {
        return { status: "Reprovado", reason: "Marca diferente" };
    }
    
    // If brands match, check for key product identifiers
    if (keepaBrand && productBrand && keepaBrand === productBrand) {
        // Extract key product words (excluding brand and common words)
        const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        const keepaProductWords = keepaWords.filter(word => !commonWords.includes(word) && word !== keepaBrand);
        const productProductWords = productWords.filter(word => !commonWords.includes(word) && word !== productBrand);
        
        // Check if at least 70% of product words match
        const matchingWords = keepaProductWords.filter(word => productProductWords.includes(word));
        const matchPercentage = matchingWords.length / Math.max(keepaProductWords.length, productProductWords.length);
        
        if (matchPercentage >= 0.7) {
            return { status: "Aprovado", reason: null };
        }
    }
    
    // If no rule-based match found, let AI handle it
    return { status: "Reprovado", reason: "Necessita análise AI" };
}

// Calculate similarity between two strings
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) {
        return 1.0;
    }
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

// Levenshtein distance calculation
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

module.exports = { analyzeProduct, analyzeTitles };


