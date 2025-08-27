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

APPROVE if ANY of these conditions are met:
1. Same brand (case-insensitive)
2. Brand is missing from one but present in the other (e.g., "Cheerios" in wholesale vs no brand in Amazon)
3. Same core product type with similar names (e.g., "Oat Crunch" vs "Oat Crunch")
4. Product names are very similar and represent the same item
5. Minor differences in packaging, size, or description

REJECT only if:
- Completely different product types (e.g., cereal vs electronics)
- Different brands when both are clearly specified and different (e.g., "Kellogg's" vs "General Mills")
- Major differences in product specifications that indicate different items

SPECIAL CONSIDERATIONS:
- Size differences are usually acceptable (e.g., 24 oz vs 15.2 oz)
- Brand variations and abbreviations should be considered the same
- Missing brand information should not prevent a match if the product names are similar
- Focus on the core product name, not packaging details

EXAMPLES:
- "Cheerios Oat Crunch Cinnamon" vs "Cinnamon Oat Crunch" = MATCH (same core product)
- "Cinnamon Toast Crunch" vs "Cinnamon Toast Crunch" = MATCH (same brand and product)
- "Kellogg's Corn Flakes" vs "General Mills Corn Flakes" = NO MATCH (different brands)

CONFIDENCE SCORING (0-10):
- 9-10: Perfect match, same brand and product name
- 7-8: Very similar, same brand with minor variations
- 5-6: Good match, similar product names, brand match or missing
- 3-4: Moderate match, some similarities but some differences
- 1-2: Weak match, minimal similarities
- 0: No match, completely different products

Respond with JSON format only:
{
  "match": true/false,
  "confidence_score": 0-10,
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
        let finalConfidenceScore = analysisResult.confidence_score || 0;
        
        // If Gemini says no match, do a more lenient manual check
        if (!finalMatch) {
            const wholesaleTitleLower = wholesaleTitle.toLowerCase();
            const amazonTitleLower = amazonTitle.toLowerCase();
            const wholesaleBrandLower = wholesaleBrand ? wholesaleBrand.toLowerCase().trim() : '';
            const amazonBrandLower = amazonBrand ? amazonBrand.toLowerCase().trim() : '';
            
            // Check for brand match (including cases where one is missing)
            const brandMatch = !wholesaleBrandLower || !amazonBrandLower || 
                              wholesaleBrandLower === amazonBrandLower ||
                              wholesaleTitleLower.includes(amazonBrandLower) ||
                              amazonTitleLower.includes(wholesaleBrandLower);
            
            // Check for product name similarity
            const wholesaleWords = wholesaleTitleLower.split(' ');
            const amazonWords = amazonTitleLower.split(' ');
            
            // Look for key product identifiers
            const keyProductWords = ['cereal', 'breakfast', 'toast', 'crunch', 'oat', 'cinnamon', 'cheerios'];
            const wholesaleKeyWords = keyProductWords.filter(keyword => 
                wholesaleWords.some(word => word.includes(keyword))
            );
            const amazonKeyWords = keyProductWords.filter(keyword => 
                amazonWords.some(word => word.includes(keyword))
            );
            
            // Check if there's significant overlap in key words
            const commonKeyWords = wholesaleKeyWords.filter(word => amazonKeyWords.includes(word));
            const hasSignificantOverlap = commonKeyWords.length >= 2;
            
            // Additional check for similar product names
            const titleSimilarity = wholesaleWords.filter(word => 
                amazonWords.some(amazonWord => 
                    word.length > 3 && amazonWord.length > 3 && 
                    (word.includes(amazonWord) || amazonWord.includes(word))
                )
            ).length;
            
            const hasTitleSimilarity = titleSimilarity >= 2;
            
            if ((brandMatch || hasSignificantOverlap) && (hasSignificantOverlap || hasTitleSimilarity)) {
                finalMatch = true;
                // Calculate confidence score based on the strength of the match
                let fallbackScore = 3; // Base score for fallback matches
                if (brandMatch) fallbackScore += 2;
                if (hasSignificantOverlap) fallbackScore += 2;
                if (hasTitleSimilarity) fallbackScore += 1;
                finalConfidenceScore = Math.min(fallbackScore, 6); // Cap at 6 for fallback matches
                
                console.log(`=== FALLBACK MATCH DETECTED FOR POSITION ${position} ===`);
                console.log('Brand match or significant product overlap found');
                console.log('Wholesale Title:', wholesaleTitle);
                console.log('Amazon Title:', amazonTitle);
                console.log('Wholesale Brand:', wholesaleBrand);
                console.log('Amazon Brand:', amazonBrand);
                console.log('Common Key Words:', commonKeyWords);
                console.log('Title Similarity Score:', titleSimilarity);
                console.log('Brand Match:', brandMatch);
                console.log('Has Significant Overlap:', hasSignificantOverlap);
                console.log('Fallback Confidence Score:', finalConfidenceScore);
            }
        }

        const finalResult = {
            isMatch: finalMatch,
            confidenceScore: finalConfidenceScore,
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
        console.log('Confidence Score:', finalResult.confidenceScore);
        console.log('Reason:', finalResult.reason);
        console.log('Brand Match:', finalResult.brandMatch ? '✅ YES' : '❌ NO');
        console.log('Title Similarity:', finalResult.titleSimilarity);
        console.log('=== END FINAL RESULT ===\n');

        return finalResult;

    } catch (error) {
        console.error("Error analyzing wholesale-Amazon match with Gemini:", error);
        return {
            isMatch: false,
            confidenceScore: 0,
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


