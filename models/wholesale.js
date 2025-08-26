// wholesale.js

const axios = require("axios");
const db = require('./database'); // This exports { sequelize, Sequelize }
const { Op } = require('sequelize'); // If you need Sequelize operators
const dotenv = require('dotenv');
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
    timestamps: true
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
    // Add any other fields you want to extract from the Amazon API response
    // e.g., feature_bullets, categories, etc., if you plan to use them.
    // For now, let's stick to the ones you provided.
});

async function searchAmazonProduct(brand, title) {
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
        const response = await axios.get(url, { params });

        if (response.data && response.data.organic_results && response.data.organic_results.length > 0) {
            // Return ALL results, not just 5
            const resultsToCapture = response.data.organic_results; 
            
            const formattedResults = resultsToCapture.map(result => {
                // Correctly extract brand from attributes, falling back to passed brand
                const extractedBrand = result.attributes?.find(attr => attr.name === 'Brand')?.value || brand;
                
                return {
                    asin: result.asin || null,
                    title: result.title || null,
                    link: result.link || null,
                    rating: result.rating || null,
                    reviews: result.reviews || null,
                    brand: extractedBrand,
                    price: result.price || null,
                    seller: result.seller || null,
                    thumbnail: result.thumbnail || null,
                    recent_sales: result.recent_sales || null,
                };
            });
            console.log(`searchAmazonProduct found ${formattedResults.length} results.`);
            return formattedResults;
        } else {
            console.log(`No Amazon organic results found for query: "${params.q}"`);
            return null;
        }
    } catch (error) {
        console.error('Error searching Amazon Product API:', error.response ? error.response.data : error.message);
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
 * Analyzes profitability by comparing wholesale costs with Amazon prices
 * @param {object} wholesaleProduct - The wholesale product data
 * @param {Array} amazonResults - Array of Amazon search results
 * @returns {object} - Analysis results with profitability metrics
 */
function analyzeProfitability(wholesaleProduct, amazonResults) {
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

    amazonResults.forEach(result => {
        const amazonPrice = extractPrice(result.price);
        if (!amazonPrice || result.title === "No Amazon results found for this product.") {
            return;
        }

        // Calculate costs and minimum required price
        const amazonFee = amazonPrice * 0.15; // 15% Amazon fee
        const totalCosts = wholesaleCost + shipping + amazonFee + minimumProfit;
        const actualProfit = amazonPrice - totalCosts;

        // Only include results that meet minimum profit requirements
        if (amazonPrice >= totalCosts) {
            const margin = wholesaleCost > 0 ? (actualProfit / wholesaleCost) * 100 : 0;
            
            let status = 'low_profit';
            if (actualProfit >= 5 && margin >= 50) {
                status = 'high_profit';
            } else if (actualProfit >= 3 && margin >= 30) {
                status = 'good_profit';
            }

            profitableResults.push({
                ...result,
                analysis: {
                    price: amazonPrice,
                    profit: actualProfit,
                    margin: margin,
                    status: status,
                    amazonFee: amazonFee,
                    totalCosts: totalCosts,
                    minimumRequiredPrice: totalCosts
                }
            });
        } else {
            unprofitableResults.push({
                ...result,
                analysis: {
                    price: amazonPrice,
                    profit: actualProfit,
                    margin: 0,
                    status: 'unprofitable',
                    amazonFee: amazonFee,
                    totalCosts: totalCosts,
                    minimumRequiredPrice: totalCosts
                }
            });
        }
    });

    // Sort profitable results by profit (highest first)
    profitableResults.sort((a, b) => b.analysis.profit - a.analysis.profit);

    // Find the best match from profitable results
    const bestMatch = profitableResults.length > 0 ? profitableResults[0] : null;

    // Generate recommendations
    const recommendations = [];
    if (profitableResults.length === 0) {
        recommendations.push('❌ No profitable results found - all Amazon prices below minimum requirements');
        recommendations.push(`💰 Minimum required price: $${(wholesaleCost + shipping + minimumProfit + (wholesaleCost * 0.15)).toFixed(2)}`);
    } else {
        if (bestMatch.analysis.status === 'high_profit') {
            recommendations.push('🚀 High profit opportunity! Consider stocking this item');
        } else if (bestMatch.analysis.status === 'good_profit') {
            recommendations.push('✅ Good profit margin - worth considering');
        } else {
            recommendations.push('⚠️ Low profit margin - may not be worth the effort');
        }

        if (unprofitableResults.length > 0) {
            recommendations.push(`📊 ${unprofitableResults.length} results filtered out for low profitability`);
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
 * @param {string} priceString - Price string like "$8.99", "8.99", etc.
 * @returns {number|null} - Extracted price or null if invalid
 */
function extractPrice(priceString) {
    if (!priceString) return null;
    
    // Remove currency symbols and common text
    const cleanPrice = priceString.toString()
        .replace(/[$€£¥]/g, '') // Remove currency symbols
        .replace(/[^\d.,]/g, '') // Keep only digits, dots, and commas
        .replace(',', ''); // Remove commas
    
    const price = parseFloat(cleanPrice);
    return isNaN(price) ? null : price;
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
    searchAmazonProduct,
    processWholesaleProductsForAmazon,
    analyzeProfitability,
    extractPrice
};

