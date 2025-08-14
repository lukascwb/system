// wholesale.js

const axios = require("axios");
const db = require('./database'); // Assuming your database connection/models are here
const { Op } = require('sequelize'); // If you need Sequelize operators
const dotenv = require('dotenv');
dotenv.config(); // Load environment variables

// --- Define your database models here ---
// It's crucial that these models are defined or imported correctly
// Ensure your db.js file exports `sequelize` and your models are set up.

// Example Model for Wholesale Product Data
const WholesaleProduct = db.sequelize.define('WholesaleProduct', {
    wholesale_id: { type: db.Sequelize.STRING, allowNull: false },
    description: { type: db.Sequelize.STRING, allowNull: true },
    upc: { type: db.Sequelize.STRING, allowNull: true },
    item: { type: db.Sequelize.STRING, allowNull: true },
    brand: { type: db.Sequelize.STRING, allowNull: true },
    size: { type: db.Sequelize.STRING, allowNull: true },
    wholesaleCost: { type: db.Sequelize.FLOAT, allowNull: true },
    packSize: { type: db.Sequelize.STRING, allowNull: true },
    qty: { type: db.Sequelize.INTEGER, allowNull: true },
    // Add any other relevant fields you might store from the CSV
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

async function searchAmazonProduct(brand, description) {
    try {
        const url = "https://www.searchapi.io/api/v1/search";
        // --- IMPROVED QUERY CONSTRUCTION ---
        // Prioritize using Brand and Description for the search.
        // If 'item' or 'upc' are more reliable, you'd need to pass those from the route.
        const searchQuery = `${brand ? brand + ' ' : ''}${description}`; 
        // If `item` is actually a SKU and might be more unique, you could try:
        // const searchQuery = `${brand ? brand + ' ' : ''}${item ? item + ' ' : ''}${description}`;

        const params = {
            "engine": "amazon_search",
            "q": searchQuery, // Use the constructed query
            "api_key": process.env.SEARCHAPI_API_KEY,
            "amazon_domain": "amazon.com",
        };

        console.log("Calling Amazon Product API with params:", JSON.stringify(params));
        const response = await axios.get(url, { params });

        if (response.data && response.data.organic_results && response.data.organic_results.length > 0) {
            const resultsToCapture = response.data.organic_results.slice(0, 5); 
            
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
        const amazonResultsForProduct = await searchAmazonProduct(product.brand, product.description);

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
};

