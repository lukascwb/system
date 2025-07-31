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
                    parts: [
                        {
                            text: prompt
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
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
        return data.candidates[0].content.parts[0].text; // Access the generated text

    } catch (error) {
        console.error("Error generating Gemini analysis:", error);
        throw error;
    }
}

async function analyzeProductSimilarity(keepaTitle, productTitle, seller) {
    try {
        const prompt = `Analise se o produto do Google Shopping é similar ao produto do Keepa E se o vendedor está na lista de varejistas aprovados.

Produto Keepa: "${keepaTitle}"
Produto Google Shopping: "${productTitle}"
Vendedor: "${seller}"

VAREJISTAS APROVADOS:
Ace Hardware, Best Buy, BJ's, CVS, Dick's Sporting Goods, Dollar General, Dollar Tree, Family Dollar, GameStop, Five Below, The Home Depot, Kohl's, Lowe's, Macy's, Michael's, PetSmart, Rite Aid, Rhode Island Novelty, Sam's Club, Staples, Target, VitaCost, Walmart, Walgreens.

REGRAS RIGOROSAS:
1. Aprove APENAS se:
   - For EXATAMENTE o mesmo produto ou variação mínima (mesma marca, mesmo modelo, apenas tamanho/cor diferente)
   - E o vendedor estiver na lista de varejistas aprovados acima
2. Reprove se:
   - Marca diferente (ex: 3M vs Filtrete)
   - Modelo diferente (ex: "Allergen Defense" vs "Ultimate Allergen")
   - Produto completamente diferente
   - Vendedor NÃO está na lista de varejistas aprovados
   - Qualquer dúvida

EXEMPLOS ESPECÍFICOS:
APROVADO:
- Keepa: "Filtrete Allergen Defense Air" vs Shopping: "Filtrete Allergen Defense Air Filter" + Vendedor: "Walmart" → Aprovado
- Keepa: "Filtrete Allergen Defense Air" vs Shopping: "Filtrete Allergen Defense Air Filter" + Vendedor: "Target" → Aprovado

REPROVADO:
- Keepa: "Filtrete Allergen Defense Air" vs Shopping: "3M Ultimate Allergen Reduction Filters" + Vendedor: "Walmart" → Reprovado (marca diferente)
- Keepa: "Filtrete Allergen Defense Air" vs Shopping: "Filtrete Allergen Defense Air Filter" + Vendedor: "Amazon" → Reprovado (vendedor não aprovado)
- Keepa: "Filtrete Allergen Defense Air" vs Shopping: "Filtrete 20x20x1 Hvac Furnace Air Filter MPR 800" + Vendedor: "Walmart" → Reprovado (modelo diferente)

SEJA MUITO CONSERVADOR. Em caso de dúvida, sempre reprove.

IMPORTANTE: Se reprovar, forneça o motivo específico da recusa de forma objetiva e concisa.

FORMATO DA RESPOSTA:
- Se APROVADO: responda apenas "Aprovado"
- Se REPROVADO: responda "Reprovado" seguido do motivo, exemplo: "Reprovado (marca diferente)" ou "Reprovado (vendedor não aprovado)"

Resposta:`;

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
                temperature: 0.0,
                maxOutputTokens: 100,
                topP: 0.1,
                topK: 1
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
        const result = data.candidates[0].content.parts[0].text.trim();
        
        console.log(`Gemini retornou: "${result}"`);
        
        // Validar se o resultado é exatamente "Aprovado" ou "Reprovado"
        if (result === "Aprovado") {
            return { status: "aprovado", motivo: null };
        } else if (result.startsWith("Reprovado")) {
            // Extrair o motivo da recusa (tudo após "Reprovado")
            const motivo = result.replace("Reprovado", "").trim();
            return { status: "reprovado", motivo: motivo || "Motivo não especificado" };
        } else {
            // Se não retornou o esperado, lançar erro com detalhes
            throw new Error(`Resposta inesperada do Gemini: "${result}". Esperado: "Aprovado" ou "Reprovado"`);
        }

    } catch (error) {
        console.error("Error analyzing product similarity:", error);
        return "reprovado"; // Em caso de erro, retorna reprovado por segurança
    }
}

module.exports = { analyzeProduct, analyzeProductSimilarity };


