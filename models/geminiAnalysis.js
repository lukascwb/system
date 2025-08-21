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
            finalStatus = "Reprovado";
            finalReason = parts[1] ? parts[1].trim() : "Motivo não especificado";
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

module.exports = { analyzeProduct, analyzeTitles };


