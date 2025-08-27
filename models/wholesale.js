// wholesale.js

const axios = require("axios");
const db = require('./database'); // This exports { sequelize, Sequelize }
const { Op } = require('sequelize'); // If you need Sequelize operators
const dotenv = require('dotenv');
const { analyzeWholesaleAmazonMatch } = require('./geminiAnalysis');
const performanceConfig = require('../config/performance');
dotenv.config(); // Load environment variables

// --- Define your database models here ---
// It's crucial that these models are defined or imported correctly
// Ensure your db.js file exports `sequelize` and your models are set up.

// WholesaleProduct model - Updated to use 'title' instead of 'description' and added new fields
const WholesaleProduct = db.sequelize.define('WholesaleProduct', {
    id: {
        type: db.Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    wholesale_id: {
        type: db.Sequelize.STRING,
        allowNull: false
    },
    title: {  // Changed from 'description' to 'title'
        type: db.Sequelize.TEXT,
        allowNull: false
    },
    upc: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    item: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    brand: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    size: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    wholesaleCost: {
        type: db.Sequelize.DECIMAL(10, 2),
        allowNull: false
    },
    packSize: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    qty: {
        type: db.Sequelize.INTEGER,
        allowNull: true
    },
    thumbnail: {  // New field for product image URL
        type: db.Sequelize.TEXT,
        allowNull: true
    },
    hyperlink: {  // New field for store product link
        type: db.Sequelize.TEXT,
        allowNull: true
    }
}, {
    tableName: 'wholesale_products',
    timestamps: true,
    indexes: [
        {
            name: 'idx_wholesale_id_created',
            fields: ['wholesale_id', 'createdAt']
        },
        {
            name: 'idx_brand_title',
            fields: ['brand', 'title']
        },
        {
            name: 'idx_upc',
            fields: ['upc']
        },
        {
            name: 'idx_item',
            fields: ['item']
        }
    ]
});



// Example Model for Amazon API Results linked to Wholesale Data
const AmazonWholesaleResult = db.sequelize.define('AmazonWholesaleResult', {
    wholesale_id: {
        type: db.Sequelize.STRING,
        allowNull: false,
    },
    // --- NEW FIELDS ADDED ---
    asin: { type: db.Sequelize.STRING, allowNull: true },
    title: { type: db.Sequelize.STRING, allowNull: true },
    link: { type: db.Sequelize.STRING(4000), allowNull: true }, // Allow longer URLs
    rating: { type: db.Sequelize.FLOAT, allowNull: true },
    reviews: { type: db.Sequelize.INTEGER, allowNull: true },
    brand: { type: db.Sequelize.STRING, allowNull: true }, // Brand from Amazon result
    price: { type: db.Sequelize.STRING, allowNull: true }, // Price as string, to handle variations like "$8.99"
    seller: { type: db.Sequelize.STRING, allowNull: true },
    thumbnail: { type: db.Sequelize.STRING, allowNull: true }, // Image URL
    recent_sales: { type: db.Sequelize.STRING, allowNull: true }, // e.g., "200+ bought in past month"
    
    // --- SEARCHAPI METADATA FIELDS ---
    search_metadata: { type: db.Sequelize.JSON, allowNull: true }, // Store the full search_metadata object
    json_url: { type: db.Sequelize.STRING(4000), allowNull: true }, // Store the JSON URL
    html_url: { type: db.Sequelize.STRING(4000), allowNull: true }, // Store the HTML URL
    search_query: { type: db.Sequelize.TEXT, allowNull: true }, // Store the search query used
    last_updated: { type: db.Sequelize.DATE, allowNull: true }, // Track when this data was last updated
    
    // Add any other fields you want to extract from the Amazon API response
    // e.g., feature_bullets, categories, etc., if you plan to use them.
    // For now, let's stick to the ones you provided.
});

// New Model for AI Analysis Results
const AIAnalysisResult = db.sequelize.define('AIAnalysisResult', {
    id: {
        type: db.Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    wholesale_id: {
        type: db.Sequelize.STRING,
        allowNull: false,
    },
    wholesale_product_id: {
        type: db.Sequelize.INTEGER,
        allowNull: false,
    },
    amazon_asin: {
        type: db.Sequelize.STRING,
        allowNull: true,
    },
    amazon_title: {
        type: db.Sequelize.TEXT,
        allowNull: true,
    },
    // AI Analysis Results
    gemini_match: {
        type: db.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    gemini_confidence_score: {
        type: db.Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    gemini_reason: {
        type: db.Sequelize.TEXT,
        allowNull: true,
    },
    brand_match: {
        type: db.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    title_similarity: {
        type: db.Sequelize.STRING,
        allowNull: true,
    },
    wholesale_title: {
        type: db.Sequelize.TEXT,
        allowNull: true,
    },
    wholesale_brand: {
        type: db.Sequelize.STRING,
        allowNull: true,
    },
    amazon_brand: {
        type: db.Sequelize.STRING,
        allowNull: true,
    },
    // Package Detection Results
    package_is_package: {
        type: db.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    package_quantity: {
        type: db.Sequelize.INTEGER,
        allowNull: true,
    },
    package_type: {
        type: db.Sequelize.STRING,
        allowNull: true,
    },
    package_confidence: {
        type: db.Sequelize.STRING,
        allowNull: true,
    },
    package_reason: {
        type: db.Sequelize.TEXT,
        allowNull: true,
    },
    // Timestamps
    last_updated: {
        type: db.Sequelize.DATE,
        allowNull: false,
        defaultValue: db.Sequelize.NOW
    }
}, {
    tableName: 'ai_analysis_results',
    timestamps: true,
    indexes: [
        {
            name: 'idx_ai_analysis_unique',
            fields: ['wholesale_id', 'wholesale_product_id', 'amazon_asin'],
            unique: true
        },
        {
            name: 'idx_ai_analysis_updated',
            fields: ['last_updated']
        }
    ]
});

async function searchAmazonProduct(brand, title, retryCount = 0) {
    try {
        const url = "https://www.searchapi.io/api/v1/search";
        // --- IMPROVED QUERY CONSTRUCTION ---
        // Prioritize using Brand and Title for the search.
        // If 'item' or 'upc' are more reliable, you'd need to pass those from the route.
        const searchQuery = `${brand ? brand + ' ' : ''}${title}`; 
        // If `item` is actually a SKU and might be more unique, you could try:
        // const searchQuery = `${brand ? brand + ' ' : ''}${item ? item + ' ' : ''}${description}`;

        const params = {
            "engine": "amazon_search",
            "q": searchQuery, // Use the constructed query
            "api_key": process.env.api_key,
            "amazon_domain": "amazon.com",
            "sort_by": "bestsellers",
        };

        console.log("Calling Amazon Product API with params:", JSON.stringify(params));
        console.log("Actual search query being sent:", searchQuery);
        
        // Add rate limiting delay
        await new Promise(resolve => setTimeout(resolve, performanceConfig.rateLimiting.searchApiDelay));
        
        const response = await axios.get(url, { 
            params,
            timeout: 30000, // 30 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.data && response.data.organic_results && response.data.organic_results.length > 0) {
            // Return ALL results, not just 5
            const resultsToCapture = response.data.organic_results; 
            
            console.log('=== AMAZON API RAW RESULTS ===');
            console.log('Number of results:', resultsToCapture.length);
            resultsToCapture.forEach((result, index) => {
                console.log(`Result ${index + 1}:`, {
                    position: result.position,
                    asin: result.asin,
                    title: result.title,
                    brand: result.attributes?.find(attr => attr.name === 'Brand')?.value
                });
            });
            console.log('=== END AMAZON API RAW RESULTS ===');
            
            const formattedResults = resultsToCapture.map((result, index) => {
                // Enhanced brand extraction - try multiple sources
                let extractedBrand = null;
                
                // Try different brand sources in order of preference
                if (result.attributes && Array.isArray(result.attributes)) {
                    const brandAttr = result.attributes.find(attr => attr.name === 'Brand');
                    if (brandAttr && brandAttr.value) {
                        extractedBrand = brandAttr.value;
                    }
                }
                
                // If no brand in attributes, try other possible fields
                if (!extractedBrand && result.brand) {
                    extractedBrand = result.brand;
                }
                
                // Fallback to passed brand if still no brand found
                if (!extractedBrand) {
                    extractedBrand = brand;
                }
                
                // Add debug logging for brand extraction
                console.log(`Brand extraction for position ${result.position || (index + 1)}:`, {
                    attributes: result.attributes,
                    brandField: result.brand,
                    extractedBrand: extractedBrand,
                    fallbackBrand: brand
                });
                
                // Construct Amazon link from ASIN if link is missing
                let amazonLink = result.link;
                if (!amazonLink && result.asin) {
                    amazonLink = `https://www.amazon.com/dp/${result.asin}`;
                }
                
                return {
                    position: result.position || (index + 1), // Use position from API or fallback to index + 1
                    asin: result.asin || null,
                    title: result.title || null,
                    link: amazonLink || null,
                    rating: result.rating || null,
                    reviews: result.reviews || null,
                    brand: extractedBrand,
                    price: result.price || null,
                    extracted_price: result.extracted_price || null,
                    seller: result.seller || null,
                    thumbnail: result.thumbnail || null,
                    recent_sales: result.recent_sales || null,
                    more_offers: result.more_offers || null, // Include more_offers data
                    // Include raw data for debugging
                    raw_attributes: result.attributes,
                    raw_brand: result.brand
                };
            });
            console.log(`searchAmazonProduct found ${formattedResults.length} results.`);
            console.log('=== FORMATTED RESULTS WITH POSITIONS ===');
            formattedResults.forEach(result => {
                console.log(`Position ${result.position} (ASIN: ${result.asin || 'N/A'}): ${result.title}`);
                console.log(`  Link: ${result.link || 'N/A'}`);
            });
            console.log('=== END FORMATTED RESULTS ===');
            return formattedResults;
        } else {
            console.log(`No Amazon organic results found for query: "${params.q}"`);
            return null;
        }
    } catch (error) {
        console.error('Error searching Amazon Product API:', error.response ? error.response.data : error.message);
        
        // Retry logic for failed API calls
        if (error.response && error.response.status === 429) {
            if (retryCount < performanceConfig.rateLimiting.maxRetries) {
                const delay = performanceConfig.rateLimiting.retryDelay;
                console.log(`Rate limited, retrying in ${delay / 1000} seconds (attempt ${retryCount + 1}/${performanceConfig.rateLimiting.maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return await searchAmazonProduct(brand, title, retryCount + 1); // Recursive retry with incremented count
            } else {
                console.error(`Max retries (${performanceConfig.rateLimiting.maxRetries}) exceeded for query: "${params.q}"`);
                return null;
            }
        }
        
        return null;
    }
}
/**
 * Processes an array of wholesale products by searching for them on Amazon and saving results.
 * @param {Array<object>} wholesaleProducts - An array of wholesale product objects from the database.
 * @returns {Promise<Array<object>>} - An array of objects containing original product data and API results.
 */
async function processWholesaleProductsForAmazon(wholesaleProducts) {
    const allResultsForBatch = [];

    for (const product of wholesaleProducts) {
        // Call searchAmazonProduct for each product. It now returns an array or null.
        const amazonResultsForProduct = await searchAmazonProduct(product.brand, product.title);

        if (amazonResultsForProduct && amazonResultsForProduct.length > 0) {
            for (const result of amazonResultsForProduct) {
                try {
                    await AmazonWholesaleResult.create({
                        wholesale_id: product.wholesale_id,
                        asin: result.asin,
                        title: result.title,
                        link: result.link,
                        rating: result.rating,
                        reviews: result.reviews,
                        brand: result.brand,
                        price: result.price,
                        seller: result.seller,
                        thumbnail: result.thumbnail,
                        recent_sales: result.recent_sales,
                        // Map any other fields you've added to the model
                    });
                    // Add the successfully saved result to the list for this batch
                    allResultsForBatch.push(result); 
                } catch (dbError) {
                    console.error(`Database error saving Amazon result for wholesale_id ${product.wholesale_id}, item: ${product.item}:`, dbError);
                    // Optionally push an error object to allResultsForBatch or log it
                }
            }
        } else {
            console.log(`No Amazon results found or an error occurred for ${product.item}.`);
        }
    }
    return allResultsForBatch; // Return all results found for the batch
}

/**
 * Detects package information from Amazon product title using Gemini AI
 * @param {string} amazonTitle - The Amazon product title
 * @returns {object} - Package information including quantity and adjusted cost multiplier
 */
async function detectPackageInfo(amazonTitle) {
    try {
        const prompt = `Analyze this Amazon product title to detect if it's a package/bundle and extract package information:

Title: "${amazonTitle}"

Look for:
1. Package quantities (e.g., "pack of 4", "4-pack", "4 count", "4 ct", "4pk", "4 units", "4 pieces")
2. Bundle information (e.g., "bundle", "set of", "multi-pack")
3. Weight/volume that might indicate multiple units (e.g., "24 oz" vs "6 oz" - if wholesale is individual 6 oz)

Extract:
- Is this a package/bundle? (true/false)
- Package quantity (number of individual units)
- Package type (e.g., "pack", "count", "units", "pieces", "bundle")

Respond with JSON format only:
{
  "isPackage": true/false,
  "quantity": number (null if not a package),
  "packageType": "string" (null if not a package),
  "confidence": "high/medium/low",
  "reason": "brief explanation"
}`;

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
                maxOutputTokens: 300,
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
        
        console.log(`\n=== PACKAGE DETECTION FOR: "${amazonTitle}" ===`);
        console.log('Gemini Raw Result:', resultText);
        
        // Parse JSON response
        let packageInfo;
        try {
            packageInfo = JSON.parse(resultText);
            console.log('Parsed Package Info:', JSON.stringify(packageInfo, null, 2));
        } catch (parseError) {
            console.error('Failed to parse Gemini JSON response for package detection:', parseError);
            // Fallback to basic detection
            packageInfo = {
                isPackage: false,
                quantity: null,
                packageType: null,
                confidence: "low",
                reason: "Failed to parse analysis"
            };
        }

        return packageInfo;

    } catch (error) {
        console.error("Error detecting package info with Gemini:", error);
        return {
            isPackage: false,
            quantity: null,
            packageType: null,
            confidence: "low",
            reason: "Error in analysis"
        };
    }
}

/**
 * Analyzes profitability by comparing wholesale costs with Amazon prices
 * @param {object} wholesaleProduct - The wholesale product data
 * @param {Array} amazonResults - Array of Amazon search results
 * @returns {object} - Analysis results with profitability metrics
 */
async function analyzeProfitability(wholesaleProduct, amazonResults) {
    if (!amazonResults || amazonResults.length === 0) {
        return {
            status: 'no_results',
            message: 'No Amazon results found for comparison',
            profitability: null,
            bestMatch: null,
            recommendations: ['No Amazon products found to compare against']
        };
    }

    const wholesaleCost = parseFloat(wholesaleProduct.wholesaleCost) || 0;
    if (wholesaleCost <= 0) {
        return {
            status: 'invalid_cost',
            message: 'Invalid wholesale cost provided',
            profitability: null,
            bestMatch: null,
            recommendations: ['Please provide a valid wholesale cost']
        };
    }

    // Calculate minimum required selling price
    const shipping = 6; // $6 shipping
    const minimumProfit = 2; // $2 minimum profit

    // Analyze each Amazon result and filter for profitability
    const profitableResults = [];
    const unprofitableResults = [];

    // Process each Amazon result with AI analysis (checking cache first)
    console.log(`Starting AI analysis for ${amazonResults.length} Amazon results...`);
    
    const analysisPromises = amazonResults.map(async (result) => {
        // Debug: Log the exact data being processed
        console.log(`\n=== PROCESSING POSITION ${result.position} ===`);
        console.log('Wholesale Product Data:', {
            id: wholesaleProduct.id,
            title: wholesaleProduct.title,
            brand: wholesaleProduct.brand,
            wholesaleCost: wholesaleProduct.wholesaleCost
        });
        console.log('Amazon Result Data:', {
            position: result.position,
            asin: result.asin,
            title: result.title,
            brand: result.brand,
            price: result.price,
            extracted_price: result.extracted_price,
            more_offers: result.more_offers,
            raw_attributes: result.raw_attributes,
            raw_brand: result.raw_brand
        });
        console.log('=== END PROCESSING DATA ===\n');
        
        // First, check if we have cached AI analysis
        const cachedAnalysis = await getAIAnalysisFromDatabase(
            wholesaleProduct.wholesale_id, 
            wholesaleProduct.id, 
            result.asin
        );
        
        let geminiAnalysis, packageInfo, fromCache = false;
        
        if (cachedAnalysis) {
            // Use cached AI analysis
            console.log(`\n--- Using cached AI analysis for Amazon result: "${result.title}" ---`);
            geminiAnalysis = cachedAnalysis.geminiAnalysis;
            packageInfo = cachedAnalysis.packageInfo;
            fromCache = true;
            console.log('Cached Gemini Analysis Result:', JSON.stringify(geminiAnalysis, null, 2));
            if (packageInfo) {
                console.log('Cached Package Detection Result:', JSON.stringify(packageInfo, null, 2));
            }
        } else {
            // Perform fresh AI analysis
            console.log(`\n--- Performing fresh AI analysis for Amazon result: "${result.title}" ---`);
            geminiAnalysis = await analyzeWholesaleAmazonMatch(wholesaleProduct, result);
            console.log('Fresh Gemini Analysis Result:', JSON.stringify(geminiAnalysis, null, 2));
            
            // Detect package information for matched products
            packageInfo = null;
            if (geminiAnalysis.isMatch && geminiAnalysis.confidenceScore >= 3) {
                console.log(`\n--- Detecting package info for matched product: "${result.title}" ---`);
                packageInfo = await detectPackageInfo(result.title);
                console.log('Fresh Package Detection Result:', JSON.stringify(packageInfo, null, 2));
            }
            
            // Save the fresh analysis to database for future caching
            await saveAIAnalysisToDatabase(
                wholesaleProduct.wholesale_id,
                wholesaleProduct.id,
                result,
                geminiAnalysis,
                packageInfo
            );
        }
        
        return { result, geminiAnalysis, packageInfo, fromCache };
    });
    
    const analysisResults = await Promise.all(analysisPromises);
    
    // Process each analysis result
    for (const { result, geminiAnalysis, packageInfo, fromCache } of analysisResults) {
        // Extract price from various possible formats
        let amazonPrice = null;
        
        // Debug price extraction
        console.log(`\n=== PRICE EXTRACTION FOR POSITION ${result.position} ===`);
        console.log('result.extracted_price:', result.extracted_price);
        console.log('result.more_offers:', result.more_offers);
        console.log('result.more_offers?.extracted_lowest_price:', result.more_offers?.extracted_lowest_price);
        console.log('result.price:', result.price);
        
        // Try different price sources in order of preference
        if (result.extracted_price) {
            amazonPrice = parseFloat(result.extracted_price);
            console.log('Using extracted_price:', amazonPrice);
        } else if (result.more_offers && result.more_offers.extracted_lowest_price) {
            amazonPrice = parseFloat(result.more_offers.extracted_lowest_price);
            console.log('Using more_offers.extracted_lowest_price:', amazonPrice);
        } else if (result.price) {
            amazonPrice = extractPrice(result.price);
            console.log('Using extracted price from result.price:', amazonPrice);
        }

        // Check if there's delivery information that needs to be separated from the price
        let deliveryInfo = null;
        if (result.fulfillment && result.fulfillment.standard_delivery) {
            deliveryInfo = {
                text: result.fulfillment.standard_delivery.text,
                type: result.fulfillment.standard_delivery.type,
                date: result.fulfillment.standard_delivery.date,
                cost: extractDeliveryCost(result.fulfillment.standard_delivery.text)
            };
            console.log('Found delivery info:', deliveryInfo);
        }
        
        console.log('Final amazonPrice:', amazonPrice);
        console.log('=== END PRICE EXTRACTION ===\n');
        
        // If no valid price, still include in unprofitable results with Gemini analysis
        if (!amazonPrice || isNaN(amazonPrice) || result.title === "No Amazon results found for this product.") {
            const analysis = {
                price: null,
                profit: null,
                margin: null,
                amazonFee: null,
                totalCosts: null,
                minimumRequiredPrice: null,
                geminiMatch: geminiAnalysis.isMatch,
                geminiConfidenceScore: geminiAnalysis.confidenceScore,
                geminiReason: geminiAnalysis.reason,
                brandMatch: geminiAnalysis.brandMatch,
                titleSimilarity: geminiAnalysis.titleSimilarity,
                packageInfo: packageInfo,
                status: 'no_price_matched' // Special status for matched products without price
            };
            
            unprofitableResults.push({
                ...result,
                analysis: analysis
            });
            continue;
        }

        // Adjust wholesale cost based on package information
        let adjustedWholesaleCost = wholesaleCost;
        let costAdjustmentReason = null;
        
        if (packageInfo && packageInfo.isPackage && packageInfo.quantity && packageInfo.quantity > 1) {
            // If Amazon item is a package, adjust the wholesale cost to match
            adjustedWholesaleCost = wholesaleCost * packageInfo.quantity;
            costAdjustmentReason = `Package detected: ${packageInfo.quantity} units (${packageInfo.packageType}) - adjusted wholesale cost from $${wholesaleCost.toFixed(2)} to $${adjustedWholesaleCost.toFixed(2)}`;
            console.log(`\n=== COST ADJUSTMENT FOR POSITION ${result.position} ===`);
            console.log(costAdjustmentReason);
            console.log('Original wholesale cost:', wholesaleCost);
            console.log('Adjusted wholesale cost:', adjustedWholesaleCost);
            console.log('Package info:', packageInfo);
            console.log('=== END COST ADJUSTMENT ===\n');
        }

        // Calculate costs and minimum required price with adjusted wholesale cost
        const amazonFee = amazonPrice * 0.15; // 15% Amazon fee
        
        // Add delivery cost if present
        const deliveryCost = deliveryInfo && deliveryInfo.cost ? deliveryInfo.cost : 0;
        
        const totalCosts = adjustedWholesaleCost + shipping + amazonFee + minimumProfit;
        const actualProfit = amazonPrice - totalCosts;

        // Create analysis object with both profitability and Gemini match data
        const analysis = {
            price: amazonPrice,
            profit: actualProfit,
            margin: adjustedWholesaleCost > 0 ? (actualProfit / adjustedWholesaleCost) * 100 : 0,
            amazonFee: amazonFee,
            totalCosts: totalCosts,
            minimumRequiredPrice: totalCosts,
            originalWholesaleCost: wholesaleCost,
            adjustedWholesaleCost: adjustedWholesaleCost,
            costAdjustmentReason: costAdjustmentReason,
            deliveryInfo: deliveryInfo, // Include delivery information
            geminiMatch: geminiAnalysis.isMatch,
            geminiConfidenceScore: geminiAnalysis.confidenceScore,
            geminiReason: geminiAnalysis.reason,
            brandMatch: geminiAnalysis.brandMatch,
            titleSimilarity: geminiAnalysis.titleSimilarity,
            packageInfo: packageInfo,
            from_cache: fromCache
        };

        // Determine status based on profit and Gemini match
        let status = 'low_profit';
        if (actualProfit >= 5 && analysis.margin >= 50) {
            status = 'high_profit';
        } else if (actualProfit >= 3 && analysis.margin >= 30) {
            status = 'good_profit';
        }

        // Add Gemini match status to the status
        if (geminiAnalysis.isMatch) {
            status += '_matched';
        } else {
            status += '_unmatched';
        }

        analysis.status = status;

        // Debug filtering logic
        console.log(`\n=== FILTERING LOGIC FOR POSITION ${result.position} ===`);
        console.log('amazonPrice >= totalCosts:', amazonPrice >= totalCosts, `(${amazonPrice} >= ${totalCosts})`);
        console.log('geminiAnalysis.isMatch:', geminiAnalysis.isMatch);
        console.log('geminiAnalysis.confidenceScore:', geminiAnalysis.confidenceScore);
        console.log('Will be profitable:', amazonPrice >= totalCosts && geminiAnalysis.isMatch);
        console.log('=== END FILTERING LOGIC ===\n');

        // Only include results that meet minimum profit requirements AND have a Gemini match (regardless of confidence)
        if (amazonPrice >= totalCosts && geminiAnalysis.isMatch) {
            profitableResults.push({
                ...result,
                analysis: analysis
            });
        } else {
            unprofitableResults.push({
                ...result,
                analysis: analysis
            });
        }
    }

    // Sort profitable results by profit (highest first)
    profitableResults.sort((a, b) => b.analysis.profit - a.analysis.profit);

    // Find the best match from profitable results
    const bestMatch = profitableResults.length > 0 ? profitableResults[0] : null;

    // Generate recommendations
    const recommendations = [];
    if (profitableResults.length === 0) {
        recommendations.push('❌ No profitable results found - all Amazon prices below minimum requirements');
        recommendations.push(`💰 Minimum required price: $${(wholesaleCost + shipping + minimumProfit + (wholesaleCost * 0.15)).toFixed(2)}`);
        
        // Check if there were unmatched results
        const unmatchedResults = unprofitableResults.filter(r => !r.analysis.geminiMatch);
        if (unmatchedResults.length > 0) {
            recommendations.push(`🤖 ${unmatchedResults.length} results filtered out due to product mismatch`);
        }
        
        // Check if there were low confidence matches that were still included
        const lowConfidenceResults = profitableResults.filter(r => r.analysis.geminiConfidenceScore <= 3);
        if (lowConfidenceResults.length > 0) {
            recommendations.push(`⚠️ ${lowConfidenceResults.length} results included with low confidence (score ≤ 3) - please verify manually`);
        }
    } else {
        if (bestMatch.analysis.status.includes('high_profit')) {
            recommendations.push('🚀 High profit opportunity! Consider stocking this item');
        } else if (bestMatch.analysis.status.includes('good_profit')) {
            recommendations.push('✅ Good profit margin - worth considering');
        } else {
            recommendations.push('⚠️ Low profit margin - may not be worth the effort');
        }

        // Add Gemini match information
        if (bestMatch.analysis.geminiMatch) {
            recommendations.push(`🤖 AI confirmed product match (confidence score: ${bestMatch.analysis.geminiConfidenceScore}/10)`);
        }

        // Add package adjustment information
        if (bestMatch.analysis.packageInfo && bestMatch.analysis.packageInfo.isPackage) {
            const packageInfo = bestMatch.analysis.packageInfo;
            recommendations.push(`📦 Package detected: ${packageInfo.quantity} units (${packageInfo.packageType}) - cost adjusted accordingly`);
        }

        if (unprofitableResults.length > 0) {
            const unmatchedCount = unprofitableResults.filter(r => !r.analysis.geminiMatch).length;
            const unprofitableCount = unprofitableResults.filter(r => r.analysis.geminiMatch).length;
            
            if (unmatchedCount > 0) {
                recommendations.push(`🤖 ${unmatchedCount} results filtered out due to product mismatch`);
            }
            if (unprofitableCount > 0) {
                recommendations.push(`📊 ${unprofitableCount} matched results filtered out for low profitability`);
            }
        }

        if (bestMatch.rating && bestMatch.rating >= 4.0) {
            recommendations.push('⭐ High-rated product on Amazon');
        }
        if (bestMatch.reviews && bestMatch.reviews >= 100) {
            recommendations.push('📊 Well-reviewed product with good demand');
        }
    }

    return {
        status: profitableResults.length > 0 ? 'profitable' : 'no_profitable',
        message: profitableResults.length > 0 
            ? `Found ${profitableResults.length} profitable results out of ${amazonResults.length} total`
            : `No profitable results found. All ${amazonResults.length} results below minimum requirements`,
        profitability: bestMatch ? bestMatch.analysis : null,
        bestMatch: bestMatch,
        profitableResults: profitableResults,
        unprofitableResults: unprofitableResults,
        totalResults: amazonResults.length,
        profitableCount: profitableResults.length,
        recommendations: recommendations
    };
}

/**
 * Extracts numeric price from various price formats
 * @param {string|number} priceInput - Price string like "$8.99", "8.99", or number
 * @returns {number|null} - Extracted price or null if invalid
 */
function extractPrice(priceInput) {
    if (!priceInput) return null;
    
    // If it's already a number, return it
    if (typeof priceInput === 'number') {
        return isNaN(priceInput) ? null : priceInput;
    }
    
    // If it's a string, clean it and parse
    const priceString = priceInput.toString();
    
    // Remove currency symbols and common text
    const cleanPrice = priceString
        .replace(/[$€£¥]/g, '') // Remove currency symbols
        .replace(/[^\d.,]/g, '') // Keep only digits, dots, and commas
        .replace(',', ''); // Remove commas
    
    const price = parseFloat(cleanPrice);
    return isNaN(price) ? null : price;
}

/**
 * Extracts delivery cost from delivery text
 * @param {string} deliveryText - Delivery text like "$14.74 delivery Sep 3 - 8"
 * @returns {number|null} - Extracted delivery cost or null if invalid
 */
function extractDeliveryCost(deliveryText) {
    if (!deliveryText) return null;
    
    // Look for price pattern in delivery text
    const priceMatch = deliveryText.match(/\$(\d+\.?\d*)/);
    if (priceMatch) {
        return parseFloat(priceMatch[1]);
    }
    
    return null;
}

/**
 * Fetches the actual JSON data from SearchAPI using the json_url from the search response
 * @param {string} jsonUrl - The json_url from the SearchAPI response
 * @returns {object|null} - The JSON data or null if error
 */
async function fetchSearchApiJsonData(jsonUrl) {
    try {
        console.log(`Fetching SearchAPI JSON data from: ${jsonUrl}`);
        
        // Validate URL
        if (!jsonUrl || typeof jsonUrl !== 'string') {
            console.error('Invalid JSON URL provided:', jsonUrl);
            return null;
        }
        
        // Add API key to the URL if it's not already present
        const url = new URL(jsonUrl);
        if (!url.searchParams.has('api_key')) {
            if (!process.env.api_key) {
                console.error('No API key available in environment variables');
                return null;
            }
            url.searchParams.set('api_key', process.env.api_key);
        }
        
        console.log(`Making request to: ${url.toString()}`);
        
        const response = await axios.get(url.toString(), {
            timeout: 30000, // 30 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        console.log(`Response status: ${response.status}`);
        console.log(`Response headers:`, response.headers);
        
        if (response.data) {
            console.log('Successfully fetched SearchAPI JSON data');
            console.log('Data type:', typeof response.data);
            console.log('Data keys:', Object.keys(response.data));
            return response.data;
        } else {
            console.log('No data received from SearchAPI JSON endpoint');
            return null;
        }
    } catch (error) {
        console.error('Error fetching SearchAPI JSON data:');
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
            console.error('Response headers:', error.response.headers);
        } else if (error.request) {
            console.error('Request error:', error.request);
        } else {
            console.error('Error message:', error.message);
        }
        console.error('Full error:', error);
        return null;
    }
}

/**
 * Fetches the actual HTML data from SearchAPI using the html_url from the search response
 * @param {string} htmlUrl - The html_url from the SearchAPI response
 * @returns {string|null} - The HTML data or null if error
 */
async function fetchSearchApiHtmlData(htmlUrl) {
    try {
        console.log(`Fetching SearchAPI HTML data from: ${htmlUrl}`);
        
        // Add API key to the URL if it's not already present
        const url = new URL(htmlUrl);
        if (!url.searchParams.has('api_key')) {
            url.searchParams.set('api_key', process.env.api_key);
        }
        
        const response = await axios.get(url.toString());
        
        if (response.data) {
            console.log('Successfully fetched SearchAPI HTML data');
            return response.data;
        } else {
            console.log('No data received from SearchAPI HTML endpoint');
            return null;
        }
    } catch (error) {
        console.error('Error fetching SearchAPI HTML data:', error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Performs a new Amazon search and returns the full SearchAPI response with URLs
 * @param {string} brand - Product brand
 * @param {string} title - Product title
 * @returns {object|null} - Full SearchAPI response with html_url and json_url or null if error
 */
async function searchAmazonProductWithUrls(brand, title) {
    try {
        // Add a small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const url = "https://www.searchapi.io/api/v1/search";
        const searchQuery = `${brand ? brand + ' ' : ''}${title}`;

        const params = {
            "engine": "amazon_search",
            "q": searchQuery,
            "api_key": process.env.api_key,
            "amazon_domain": "amazon.com",
            "sort_by": "bestsellers",
        };

        console.log("Calling Amazon Product API with params:", JSON.stringify(params));
        console.log("Actual search query being sent:", searchQuery);
        
        if (!process.env.api_key) {
            console.error('No API key available for SearchAPI request');
            return null;
        }
        
        const response = await axios.get(url, { 
            params,
            timeout: 30000, // 30 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        console.log(`SearchAPI response status: ${response.status}`);
        
        if (response.data) {
            console.log('Successfully received SearchAPI response with URLs');
            console.log('Response data type:', typeof response.data);
            console.log('Response data keys:', Object.keys(response.data));
            
            if (response.data.search_metadata) {
                console.log('Search metadata keys:', Object.keys(response.data.search_metadata));
                console.log('JSON URL available:', !!response.data.search_metadata.json_url);
                console.log('HTML URL available:', !!response.data.search_metadata.html_url);
            }
            
            return response.data; // Return the full response including search_metadata
        } else {
            console.log(`No SearchAPI response received for query: "${params.q}"`);
            return null;
        }
    } catch (error) {
        console.error('Error searching Amazon Product API:');
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
            console.error('Response headers:', error.response.headers);
        } else if (error.request) {
            console.error('Request error:', error.request);
        } else {
            console.error('Error message:', error.message);
        }
        console.error('Full error:', error);
        return null;
    }
}

// Function to save SearchAPI data to database
async function saveSearchApiDataToDatabase(wholesaleId, searchQuery, searchApiResponse) {
    try {
        console.log(`Saving SearchAPI data to database for wholesale_id: ${wholesaleId}`);
        
        if (!searchApiResponse || !searchApiResponse.search_metadata) {
            console.log('No search_metadata in response, skipping database save');
            return null;
        }
        
        const searchMetadata = searchApiResponse.search_metadata;
        
        // Check if we already have data for this wholesale_id
        const existingRecord = await AmazonWholesaleResult.findOne({
            where: { wholesale_id: wholesaleId }
        });
        
        const dataToSave = {
            wholesale_id: wholesaleId,
            search_metadata: searchMetadata,
            json_url: searchMetadata.json_url || null,
            html_url: searchMetadata.html_url || null,
            search_query: searchQuery,
            last_updated: new Date()
        };
        
        if (existingRecord) {
            // Update existing record
            await existingRecord.update(dataToSave);
            console.log(`Updated existing SearchAPI data for wholesale_id: ${wholesaleId}`);
        } else {
            // Create new record
            await AmazonWholesaleResult.create(dataToSave);
            console.log(`Created new SearchAPI data for wholesale_id: ${wholesaleId}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error saving SearchAPI data to database:', error);
        return null;
    }
}

// Function to get SearchAPI data from database
async function getSearchApiDataFromDatabase(wholesaleId) {
    try {
        console.log(`Checking database for SearchAPI data for wholesale_id: ${wholesaleId}`);
        
        const record = await AmazonWholesaleResult.findOne({
            where: { wholesale_id: wholesaleId }
        });
        
        if (record && record.search_metadata) {
            console.log(`Found cached SearchAPI data for wholesale_id: ${wholesaleId}`);
            return {
                search_metadata: record.search_metadata,
                json_url: record.json_url,
                html_url: record.html_url,
                search_query: record.search_query,
                last_updated: record.last_updated,
                from_cache: true
            };
        } else {
            console.log(`No cached SearchAPI data found for wholesale_id: ${wholesaleId}`);
            return null;
        }
    } catch (error) {
        console.error('Error retrieving SearchAPI data from database:', error);
        return null;
    }
}

// Enhanced search function that checks database first
async function searchAmazonProductWithUrlsAndCache(brand, title, wholesaleId, productId = null) {
    try {
        // Create a unique cache key for each product
        const cacheKey = productId ? `${wholesaleId}_product_${productId}` : wholesaleId;
        console.log(`Searching Amazon with cache for cache key: ${cacheKey}`);
        
        // First, check if we have cached data
        const cachedData = await getSearchApiDataFromDatabase(cacheKey);
        
        if (cachedData) {
            console.log(`Using cached SearchAPI data for cache key: ${cacheKey}`);
            return {
                search_metadata: cachedData.search_metadata, // Fixed to return search_metadata directly
                cached: true
            };
        }
        
        // If no cached data, make the API call
        console.log(`No cached data found, making new SearchAPI request for cache key: ${cacheKey}`);
        const searchQuery = `${brand ? brand + ' ' : ''}${title}`;
        const searchApiResponse = await searchAmazonProductWithUrls(brand, title);
        
        if (searchApiResponse && searchApiResponse.search_metadata) {
            // Save the new data to database
            await saveSearchApiDataToDatabase(cacheKey, searchQuery, searchApiResponse);
            console.log(`Saved new SearchAPI data to database for cache key: ${cacheKey}`);
        }
        
        return searchApiResponse;
    } catch (error) {
        console.error('Error in searchAmazonProductWithUrlsAndCache:', error);
        return null;
    }
}

/**
 * Saves Amazon search results to the database for caching
 * @param {string} wholesaleId - The wholesale batch ID
 * @param {string} searchQuery - The search query used
 * @param {Array} amazonResults - Array of Amazon search results
 * @returns {Promise<boolean>} - Success status
 */
async function saveAmazonSearchResultsToDatabase(wholesaleId, searchQuery, amazonResults) {
    try {
        console.log(`Saving Amazon search results to database for wholesale_id: ${wholesaleId}`);
        if (!amazonResults || amazonResults.length === 0) {
            console.log('No Amazon results to save, skipping database save');
            return false;
        }

        // Check if we already have recent results (within 1 month)
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const existingRecords = await AmazonWholesaleResult.findAll({
            where: { 
                wholesale_id: wholesaleId,
                last_updated: {
                    [Op.gte]: oneMonthAgo
                }
            }
        });

        if (existingRecords.length > 0) {
            console.log(`Found ${existingRecords.length} recent records for wholesale_id: ${wholesaleId}, updating...`);
            // Update existing records
            for (let i = 0; i < Math.min(existingRecords.length, amazonResults.length); i++) {
                await existingRecords[i].update({
                    asin: amazonResults[i].asin,
                    title: amazonResults[i].title,
                    link: amazonResults[i].link,
                    rating: amazonResults[i].rating,
                    reviews: amazonResults[i].reviews,
                    brand: amazonResults[i].brand,
                    price: amazonResults[i].price,
                    seller: amazonResults[i].seller,
                    thumbnail: amazonResults[i].thumbnail,
                    recent_sales: amazonResults[i].recent_sales,
                    search_query: searchQuery,
                    last_updated: new Date()
                });
            }
        } else {
            console.log(`No recent records found, creating new records for wholesale_id: ${wholesaleId}`);
            // Create new records
            for (const result of amazonResults) {
                await AmazonWholesaleResult.create({
                    wholesale_id: wholesaleId,
                    asin: result.asin,
                    title: result.title,
                    link: result.link,
                    rating: result.rating,
                    reviews: result.reviews,
                    brand: result.brand,
                    price: result.price,
                    seller: result.seller,
                    thumbnail: result.thumbnail,
                    recent_sales: result.recent_sales,
                    search_query: searchQuery,
                    last_updated: new Date()
                });
            }
        }

        console.log(`Successfully saved ${amazonResults.length} Amazon results to database for wholesale_id: ${wholesaleId}`);
        return true;
    } catch (error) {
        console.error('Error saving Amazon search results to database:', error);
        return false;
    }
}

/**
 * Retrieves cached Amazon search results from the database
 * @param {string} wholesaleId - The wholesale batch ID
 * @returns {Promise<Array|null>} - Cached Amazon results or null if not found/expired
 */
async function getAmazonSearchResultsFromDatabase(wholesaleId) {
    try {
        console.log(`Checking database for Amazon search results for wholesale_id: ${wholesaleId}`);
        
        // Check for results within the last month
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const records = await AmazonWholesaleResult.findAll({
            where: { 
                wholesale_id: wholesaleId,
                last_updated: {
                    [Op.gte]: oneMonthAgo
                }
            },
            order: [['last_updated', 'DESC']]
        });

        if (records && records.length > 0) {
            console.log(`Found ${records.length} cached Amazon results for wholesale_id: ${wholesaleId}`);
            
            // Convert database records back to the expected format
            const cachedResults = records.map(record => ({
                position: record.id, // Use ID as position since we don't store position
                asin: record.asin,
                title: record.title,
                link: record.link,
                rating: record.rating,
                reviews: record.reviews,
                brand: record.brand,
                price: record.price,
                seller: record.seller,
                thumbnail: record.thumbnail,
                recent_sales: record.recent_sales,
                from_cache: true,
                last_updated: record.last_updated
            }));

            return cachedResults;
        } else {
            console.log(`No cached Amazon results found for wholesale_id: ${wholesaleId}`);
            return null;
        }
    } catch (error) {
        console.error('Error retrieving Amazon search results from database:', error);
        return null;
    }
}

/**
 * Cached version of searchAmazonProduct that implements 1-month refresh policy
 * @param {string} brand - Product brand
 * @param {string} title - Product title
 * @param {string} wholesaleId - The wholesale batch ID for caching
 * @param {number} productId - The individual product ID for unique caching
 * @returns {Promise<Array|null>} - Amazon search results
 */
async function searchAmazonProductWithCache(brand, title, wholesaleId, productId = null) {
    try {
        // Create a unique cache key for each product
        const cacheKey = productId ? `${wholesaleId}_product_${productId}` : wholesaleId;
        console.log(`Searching Amazon with cache for cache key: ${cacheKey}`);
        
        // First, try to get cached results
        const cachedResults = await getAmazonSearchResultsFromDatabase(cacheKey);
        
        if (cachedResults && cachedResults.length > 0) {
            console.log(`Using cached Amazon results for cache key: ${cacheKey} (${cachedResults.length} results)`);
            return cachedResults;
        }

        // No cached data or expired, make new API request
        console.log(`No cached data found or expired, making new Amazon API request for cache key: ${cacheKey}`);
        const searchQuery = `${brand ? brand + ' ' : ''}${title}`;
        const freshResults = await searchAmazonProduct(brand, title);
        
        if (freshResults && freshResults.length > 0) {
            // Save the fresh results to database for future caching
            await saveAmazonSearchResultsToDatabase(cacheKey, searchQuery, freshResults);
            console.log(`Saved fresh Amazon results to database for cache key: ${cacheKey}`);
        }

        return freshResults;
    } catch (error) {
        console.error('Error in searchAmazonProductWithCache:', error);
        return null;
    }
}

/**
 * Saves AI analysis results to the database for caching
 * @param {string} wholesaleId - The wholesale batch ID
 * @param {number} wholesaleProductId - The wholesale product ID
 * @param {object} amazonResult - The Amazon result object
 * @param {object} geminiAnalysis - The Gemini AI analysis result
 * @param {object} packageInfo - The package detection result
 * @returns {Promise<boolean>} - Success status
 */
async function saveAIAnalysisToDatabase(wholesaleId, wholesaleProductId, amazonResult, geminiAnalysis, packageInfo) {
    try {
        console.log(`Saving AI analysis to database for wholesale_id: ${wholesaleId}, product_id: ${wholesaleProductId}, asin: ${amazonResult.asin}`);
        
        const dataToSave = {
            wholesale_id: wholesaleId,
            wholesale_product_id: wholesaleProductId,
            amazon_asin: amazonResult.asin,
            amazon_title: amazonResult.title,
            wholesale_title: null, // Will be filled from wholesale product
            wholesale_brand: null, // Will be filled from wholesale product
            amazon_brand: amazonResult.brand,
            // AI Analysis Results
            gemini_match: geminiAnalysis.isMatch,
            gemini_confidence_score: geminiAnalysis.confidenceScore,
            gemini_reason: geminiAnalysis.reason,
            brand_match: geminiAnalysis.brandMatch,
            title_similarity: geminiAnalysis.titleSimilarity,
            // Package Detection Results
            package_is_package: packageInfo ? packageInfo.isPackage : false,
            package_quantity: packageInfo ? packageInfo.quantity : null,
            package_type: packageInfo ? packageInfo.packageType : null,
            package_confidence: packageInfo ? packageInfo.confidence : null,
            package_reason: packageInfo ? packageInfo.reason : null,
            last_updated: new Date()
        };
        
        // Check if we already have an analysis for this combination
        const existingRecord = await AIAnalysisResult.findOne({
            where: {
                wholesale_id: wholesaleId,
                wholesale_product_id: wholesaleProductId,
                amazon_asin: amazonResult.asin
            }
        });
        
        if (existingRecord) {
            // Update existing record
            await existingRecord.update(dataToSave);
            console.log(`Updated existing AI analysis for wholesale_id: ${wholesaleId}, product_id: ${wholesaleProductId}, asin: ${amazonResult.asin}`);
        } else {
            // Create new record
            await AIAnalysisResult.create(dataToSave);
            console.log(`Created new AI analysis for wholesale_id: ${wholesaleId}, product_id: ${wholesaleProductId}, asin: ${amazonResult.asin}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error saving AI analysis to database:', error);
        return false;
    }
}

/**
 * Retrieves AI analysis results from the database
 * @param {string} wholesaleId - The wholesale batch ID
 * @param {number} wholesaleProductId - The wholesale product ID
 * @param {string} amazonAsin - The Amazon product ASIN
 * @returns {Promise<object|null>} - Cached AI analysis or null if not found
 */
async function getAIAnalysisFromDatabase(wholesaleId, wholesaleProductId, amazonAsin) {
    try {
        console.log(`Checking database for AI analysis: wholesale_id: ${wholesaleId}, product_id: ${wholesaleProductId}, asin: ${amazonAsin}`);
        
        const record = await AIAnalysisResult.findOne({
            where: {
                wholesale_id: wholesaleId,
                wholesale_product_id: wholesaleProductId,
                amazon_asin: amazonAsin
            }
        });
        
        if (record) {
            console.log(`Found cached AI analysis for wholesale_id: ${wholesaleId}, product_id: ${wholesaleProductId}, asin: ${amazonAsin}`);
            
            // Convert database record back to the expected format
            const geminiAnalysis = {
                isMatch: record.gemini_match,
                confidenceScore: record.gemini_confidence_score,
                reason: record.gemini_reason,
                brandMatch: record.brand_match,
                titleSimilarity: record.title_similarity
            };
            
            const packageInfo = record.package_is_package ? {
                isPackage: record.package_is_package,
                quantity: record.package_quantity,
                packageType: record.package_type,
                confidence: record.package_confidence,
                reason: record.package_reason
            } : null;
            
            return {
                geminiAnalysis,
                packageInfo,
                from_cache: true,
                last_updated: record.last_updated
            };
        } else {
            console.log(`No cached AI analysis found for wholesale_id: ${wholesaleId}, product_id: ${wholesaleProductId}, asin: ${amazonAsin}`);
            return null;
        }
    } catch (error) {
        console.error('Error retrieving AI analysis from database:', error);
        return null;
    }
}

/**
 * Processes wholesale products in parallel batches for better performance
 * @param {Array} wholesaleProducts - Array of wholesale products
 * @param {number} batchSize - Number of products to process in parallel (default: 5)
 * @param {number} delayBetweenBatches - Delay between batches in ms (default: 2000)
 * @returns {Promise<Array>} - Array of products with Amazon results
 */
async function processWholesaleProductsInBatches(wholesaleProducts, batchSize = performanceConfig.batchProcessing.defaultBatchSize, delayBetweenBatches = performanceConfig.batchProcessing.delayBetweenBatches) {
    console.log(`Processing ${wholesaleProducts.length} products in batches of ${batchSize}`);
    
    const results = [];
    
    for (let i = 0; i < wholesaleProducts.length; i += batchSize) {
        const batch = wholesaleProducts.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(wholesaleProducts.length / batchSize)} (${batch.length} products)`);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (wholesaleProduct) => {
            try {
                const searchResult = await searchAmazonProductWithCache(
                    wholesaleProduct.brand,
                    wholesaleProduct.title,
                    wholesaleProduct.wholesale_id,
                    wholesaleProduct.id
                );
                
                const searchQuery = `${wholesaleProduct.brand ? wholesaleProduct.brand + ' ' : ''}${wholesaleProduct.title}`;
                
                let amazonResults = [];
                if (searchResult && searchResult.length > 0) {
                    const isFromCache = searchResult[0] && searchResult[0].from_cache;
                    console.log(`Found ${searchResult.length} Amazon results for "${wholesaleProduct.title}" (${isFromCache ? 'CACHED' : 'FRESH'})`);
                    amazonResults = searchResult;
                } else {
                    console.log(`No Amazon results found for "${wholesaleProduct.title}"`);
                    amazonResults = [{ title: "No Amazon results found for this product.", price: null, rating: null, reviews: null, seller: null, link: null, brand: null, thumbnail: null, recent_sales: null }];
                }
                
                return {
                    wholesaleProduct: wholesaleProduct,
                    amazonResults: amazonResults,
                    searchQuery: searchQuery
                };
            } catch (error) {
                console.error(`Error processing product ${wholesaleProduct.id}:`, error);
                return {
                    wholesaleProduct: wholesaleProduct,
                    amazonResults: [{ title: "Error processing this product.", price: null, rating: null, reviews: null, seller: null, link: null, brand: null, thumbnail: null, recent_sales: null }],
                    searchQuery: `${wholesaleProduct.brand ? wholesaleProduct.brand + ' ' : ''}${wholesaleProduct.title}`
                };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Add delay between batches to prevent rate limiting (except for last batch)
        if (i + batchSize < wholesaleProducts.length) {
            console.log(`Waiting ${delayBetweenBatches}ms before next batch...`);
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
    }
    
    console.log(`Completed processing all ${results.length} products`);
    return results;
}

// Sync models
// (Ensure this part is handled once, ideally in db.js, not in each model file)
// Removed redundant syncs from here as they should be in db.js


// Sync model
(async () => {
    try {
        await db.sequelize.authenticate();
        console.log('Connection has been established successfully.');
        //await AmazonWholesaleResult.sync();
        await AmazonWholesaleResult.sync({ force: true }); // force
        console.log('AmazonWholesaleResult table synchronized.');
        
        // Sync AI Analysis Result model
        await AIAnalysisResult.sync({ force: true }); // force
        console.log('AIAnalysisResult table synchronized.');
    } catch (err) {
        console.error('Unable to connect to the database:', err);
    }
})();


// Sync model
(async () => {
    try {
        await db.sequelize.authenticate();
        console.log('Connection has been established successfully.');
        await WholesaleProduct.sync();
        //await WholesaleProduct.sync({ force: true }); // force
        console.log('WholesaleProduct table synchronized.');
    } catch (err) {
        console.error('Unable to connect to the database:', err);
    }
})();


// --- Export functions and models ---
module.exports = {
    WholesaleProduct,
    AmazonWholesaleResult,
    AIAnalysisResult,
    searchAmazonProduct,
    searchAmazonProductWithUrls,
    searchAmazonProductWithUrlsAndCache,
    fetchSearchApiJsonData,
    fetchSearchApiHtmlData,
    saveSearchApiDataToDatabase,
    getSearchApiDataFromDatabase,
    processWholesaleProductsForAmazon,
    analyzeProfitability,
    detectPackageInfo,
    extractPrice,
    saveAmazonSearchResultsToDatabase,
    getAmazonSearchResultsFromDatabase,
    searchAmazonProductWithCache,
    saveAIAnalysisToDatabase,
    getAIAnalysisFromDatabase,
    processWholesaleProductsInBatches
};


