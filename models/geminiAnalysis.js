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
        const prompt = `Analise se os dois títulos de produtos se referem ao mesmo produto:

Título do Keepa: "${keepaTitle}"
Título do Produto: "${productTitle}"

REGRAS RIGOROSAS:

APROVE APENAS se:
- For EXATAMENTE o mesmo produto ou variação mínima (mesma marca, mesmo modelo, apenas tamanho/cor diferente)
- E o modelo, estilo, cor, sabor, etc., forem EXATAMENTE os mesmos entre Keepa e Shopping

REPROVE se:
- Marca diferente (ex: 3M vs Filtrete)
- Modelo diferente (ex: "Allergen Defense" vs "Ultimate Allergen")
- Produto completamente diferente
- Modelo, estilo, cor, sabor, etc., são diferentes entre Keepa e Shopping

Responda APENAS com "Aprovado" ou "Reprovado|motivo" (exemplo: "Reprovado|Marca diferente" ou "Reprovado|Modelo diferente").
O motivo deve ser objetivo e máximo 2 palavras.`;

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

async function analyzeWholesaleAmazonMatch(wholesaleProduct, amazonResult) {
    try {
        const wholesaleTitle = wholesaleProduct.title || '';
        let wholesaleBrand = wholesaleProduct.brand || '';
        const amazonTitle = amazonResult.title || '';
        const amazonBrand = amazonResult.brand || '';
        const position = amazonResult.position || 'Unknown';

        // Extract brand from wholesale title if brand field is empty
        if (!wholesaleBrand && wholesaleTitle) {
            // Common pattern: "Brand Name Product Description"
            const titleWords = wholesaleTitle.split(' ');
            if (titleWords.length >= 2) {
                // Try to extract brand from the beginning of the title
                // Look for common brand patterns
                const potentialBrand = titleWords.slice(0, 3).join(' '); // Take first 3 words
                wholesaleBrand = potentialBrand;
            }
        }

        // Debug logging with position
        console.log(`\n=== AI ANALYSIS FOR POSITION ${position} ===`);
        console.log('Position:', position);
        console.log('Wholesale Title:', wholesaleTitle);
        console.log('Wholesale Brand (extracted):', wholesaleBrand);
        console.log('Amazon Title:', amazonTitle);
        console.log('Amazon Brand:', amazonBrand);
        console.log('Amazon ASIN:', amazonResult.asin || 'N/A');
        console.log('Amazon Price:', amazonResult.price || amazonResult.extracted_price || 'N/A');
        console.log('=== END POSITION ANALYSIS ===\n');

        // Debug: Log the exact prompt being sent to Gemini
        console.log(`\n=== GEMINI PROMPT FOR POSITION ${position} ===`);
        console.log('Wholesale Title:', wholesaleTitle);
        console.log('Wholesale Brand:', wholesaleBrand);
        console.log('Amazon Title:', amazonTitle);
        console.log('Amazon Brand:', amazonBrand);
        console.log('=== END GEMINI PROMPT ===\n');

        const prompt = `Compare these two product listings to determine if they are the same product:

WHOLESALE PRODUCT:
- Title: "${wholesaleTitle}"
- Brand: "${wholesaleBrand}"

AMAZON PRODUCT:
- Title: "${amazonTitle}"
- Brand: "${amazonBrand}"

ANALYSIS RULES:

APPROVE ONLY if:
- Same brand (or brand is missing from one but present in the other)
- Same core product (same model, type, variant)
- Minor differences in packaging, size, or description are acceptable
- Product is essentially the same item
- Brand names that are similar or variations of each other (e.g., "Cinnamon Toast Crunch" vs "Cinnamon Toast Crunch")

REJECT if:
- Different brands (when both brands are clearly specified and different)
- Different product types/models
- Completely different products
- Major differences in product specifications

Consider:
- Brand matching (case-insensitive)
- Product type matching
- Size/quantity variations are usually acceptable
- Packaging differences are usually acceptable
- Brand variations and abbreviations

IMPORTANT: For the example above:
- Wholesale: "Cinnamon Toast Crunch French, Breakfast Cereal, 18.1 oz" (Brand: "Cinnamon Toast Crunch")
- Amazon: "French, Breakfast Cereal, 18.1 oz" (Brand: "Cinnamon Toast Crunch")
- These should MATCH because they have the same brand and same product type

Respond with JSON format only:
{
  "match": true/false,
  "confidence": "high/medium/low",
  "reason": "brief explanation",
  "brand_match": true/false,
  "title_similarity": "high/medium/low"
}`;

        // Debug: Log the complete prompt being sent to Gemini
        console.log(`\n=== COMPLETE GEMINI PROMPT FOR POSITION ${position} ===`);
        console.log(prompt);
        console.log('=== END COMPLETE PROMPT ===\n');

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
                maxOutputTokens: 500,
                topP: 0.95,
                topK: 40,
                responseMimeType: 'application/json'
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
        const resultText = data.candidates[0].content.parts[0].text.trim();
        
        console.log(`\n=== AI RESPONSE FOR POSITION ${position} ===`);
        console.log('Gemini Raw Result:', resultText);
        
        // Parse JSON response
        let analysisResult;
        try {
            analysisResult = JSON.parse(resultText);
            console.log('Parsed Analysis Result:', JSON.stringify(analysisResult, null, 2));
        } catch (parseError) {
            console.error('Failed to parse Gemini JSON response:', parseError);
            // Fallback to basic analysis
            analysisResult = {
                match: false,
                confidence: "low",
                reason: "Failed to parse analysis",
                brand_match: false,
                title_similarity: "low"
            };
        }

        // Fallback analysis for cases where Gemini might be too strict
        let finalMatch = analysisResult.match || false;
        let finalConfidence = analysisResult.confidence || "low";
        
        // If Gemini says no match, but brands are clearly the same, do a manual check
        if (!finalMatch && wholesaleBrand && amazonBrand) {
            const wholesaleBrandLower = wholesaleBrand.toLowerCase().trim();
            const amazonBrandLower = amazonBrand.toLowerCase().trim();
            
            if (wholesaleBrandLower === amazonBrandLower) {
                // Brands match exactly, check if product types are similar
                const wholesaleWords = wholesaleTitle.toLowerCase().split(' ');
                const amazonWords = amazonTitle.toLowerCase().split(' ');
                
                // Check for common product keywords
                const commonKeywords = ['cereal', 'breakfast', 'toast', 'crunch', 'french'];
                const wholesaleHasKeywords = commonKeywords.some(keyword => 
                    wholesaleWords.some(word => word.includes(keyword))
                );
                const amazonHasKeywords = commonKeywords.some(keyword => 
                    amazonWords.some(word => word.includes(keyword))
                );
                
                if (wholesaleHasKeywords && amazonHasKeywords) {
                    finalMatch = true;
                    finalConfidence = "high";
                    console.log(`=== FALLBACK MATCH DETECTED FOR POSITION ${position} ===`);
                    console.log('Brands match and product keywords found in both titles');
                    console.log('Wholesale Brand:', wholesaleBrand);
                    console.log('Amazon Brand:', amazonBrand);
                    console.log('Common Keywords Found:', commonKeywords.filter(keyword => 
                        wholesaleWords.some(word => word.includes(keyword)) && 
                        amazonWords.some(word => word.includes(keyword))
                    ));
                }
            }
        }

        const finalResult = {
            isMatch: finalMatch,
            confidence: finalConfidence,
            reason: analysisResult.reason || "Analysis completed",
            brandMatch: analysisResult.brand_match || false,
            titleSimilarity: analysisResult.title_similarity || "low",
            wholesaleTitle: wholesaleTitle,
            amazonTitle: amazonTitle,
            wholesaleBrand: wholesaleBrand,
            amazonBrand: amazonBrand
        };

        console.log(`\n=== FINAL RESULT FOR POSITION ${position} ===`);
        console.log('Match:', finalResult.isMatch ? '✅ YES' : '❌ NO');
        console.log('Confidence:', finalResult.confidence);
        console.log('Reason:', finalResult.reason);
        console.log('Brand Match:', finalResult.brandMatch ? '✅ YES' : '❌ NO');
        console.log('Title Similarity:', finalResult.titleSimilarity);
        console.log('=== END FINAL RESULT ===\n');

        return finalResult;

    } catch (error) {
        console.error("Error analyzing wholesale-Amazon match with Gemini:", error);
        return {
            isMatch: false,
            confidence: "low",
            reason: "Error in analysis",
            brandMatch: false,
            titleSimilarity: "low",
            wholesaleTitle: wholesaleProduct.title || '',
            amazonTitle: amazonResult.title || '',
            wholesaleBrand: wholesaleProduct.brand || '',
            amazonBrand: amazonResult.brand || ''
        };
    }
}

module.exports = { analyzeProduct, analyzeTitles, analyzeWholesaleAmazonMatch };


