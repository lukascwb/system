//hello world
const express = require('express');
const app = express();
const handlebars = require('express-handlebars')
const handlebarsHelpers = require('handlebars-helpers')(); // Register helpers
const bodyParser = require('body-parser')
const User = require('./models/user')
const path = require("path")
const apishopping = require('./models/apishopping');
const multer = require('multer');
const { parse } = require('csv-parse');
const fs = require('fs');
//const removeEmojis = import('remove-emoji');
const KeepaCSV = require('./models/keepa');
const db = require('./models/database');
const { Op } = require('sequelize');
const sequelize = require('sequelize');
const dotenv = require('dotenv');
const session = require('express-session');
const bcryptjs = require('bcryptjs');
const { analyzeProduct, analyzeTitles } = require('./models/geminiAnalysis')
const { GoogleGenerativeAI } = require("@google/generative-ai");



//const stripBomStream = require('strip-bom-stream');



//Config
dotenv.config();

//Setup HandleBars

//Template Engine
app.engine('handlebars', handlebars.engine({
    defaultLayout: 'main',
    debug: true,
    runtimeOptions: {
        allowProtoPropertiesByDefault: true,
        allowProtoMethodsByDefault: true,
    },
    helpers: {
        ...handlebarsHelpers, // Spread the helpers from the package
        // ... any other custom helpers you have ...
        range: function (start, end) {
            return Array.from({ length: end - start + 1 }, (_, i) => start + i);
        },
        inc: function (value) {
            return parseInt(value, 10) + 1; // Ensure value is a number
        },
        lookup: function (obj, key) {
            return obj[key];
        },
        dec: function (value) {
            return value - 1;
        },
        checkAmazonBB: function (AmazonBB) {
            let percentage = Number(AmazonBB.replace('%', ''));
            return percentage > 50 ? '❎' : '☑️';
        },
        BJs: function (brand) {
            return "https://www.bjs.com/search/" + brand + "/q?template=clp";
        },
        checkApprovedSeller: function (seller, geminiStatus, geminiReason) {
            // Since seller pre-filter is done before Gemini analysis,
            // geminiStatus already contains the final result
            if (geminiStatus === 'Reprovado') {
                return geminiReason ? `Reprovado - ${geminiReason}` : 'Reprovado';
            }
            return ''; // Aprovado
        },
        eq: function (a, b) {
            return a === b;
        },
        number: function (value) {
            if (!value) return 0;
            // Remove % symbol and any non-numeric characters except decimal point
            const cleanValue = String(value).replace(/[^\d.]/g, '');
            const parsed = parseFloat(cleanValue);
            const result = isNaN(parsed) ? 0 : parsed;
            console.log(`Number Helper Debug: "${value}" -> "${cleanValue}" -> ${parsed} -> ${result}`);
            return result;
        },
        gte: function (a, b) {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            console.log(`GTE Helper Debug: ${a} >= ${b} = ${numA} >= ${numB} = ${!isNaN(numA) && !isNaN(numB) && numA >= numB}`);
            return !isNaN(numA) && !isNaN(numB) && numA >= numB;
        },
        lte: function (a, b) {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            return !isNaN(numA) && !isNaN(numB) && numA <= numB;
        },
        titleSimilarity: function (keepaTitle, apiTitle) {
            console.log('Title Similarity Debug: Input', { 
                keepaTitle: keepaTitle ? keepaTitle.substring(0, 50) + '...' : 'null',
                apiTitle: apiTitle ? apiTitle.substring(0, 50) + '...' : 'null'
            });
            
            if (!keepaTitle || !apiTitle) {
                console.log('Title Similarity Debug: Missing title', { keepaTitle, apiTitle });
                return 0;
            }
            
            // Normalize titles for comparison
            const normalizeTitle = (title) => {
                return title.toLowerCase()
                    .replace(/[^\w\s]/g, ' ') // Remove special characters
                    .replace(/\s+/g, ' ') // Normalize spaces
                    .trim();
            };
            
            const keepaNormalized = normalizeTitle(keepaTitle);
            const apiNormalized = normalizeTitle(apiTitle);
            
            // Split into words and filter out common words
            const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'ours', 'theirs'];
            
            const keepaWords = keepaNormalized.split(' ').filter(word => word.length > 2 && !commonWords.includes(word));
            const apiWords = apiNormalized.split(' ').filter(word => word.length > 2 && !commonWords.includes(word));
            
            if (keepaWords.length === 0 || apiWords.length === 0) return 0;
            
            // Count matching words with improved logic
            let matchingWords = 0;
            let totalWords = Math.max(keepaWords.length, apiWords.length);
            
            for (const keepaWord of keepaWords) {
                for (const apiWord of apiWords) {
                    // Check for exact match or high similarity
                    if (keepaWord === apiWord || 
                        keepaWord.includes(apiWord) || 
                        apiWord.includes(keepaWord) ||
                        (keepaWord.length > 4 && apiWord.length > 4 && 
                         (keepaWord.substring(0, 4) === apiWord.substring(0, 4))) ||
                        (keepaWord.length > 3 && apiWord.length > 3 && 
                         (keepaWord.substring(0, 3) === apiWord.substring(0, 3)))) {
                        matchingWords++;
                        break;
                    }
                }
            }
            
            // Calculate similarity score (0-10) with improved weighting
            let similarityScore = 0;
            if (totalWords > 0) {
                similarityScore = Math.round((matchingWords / totalWords) * 10);
            }
            
            // Add bonus for exact title matches
            if (keepaNormalized === apiNormalized) {
                similarityScore = 10;
            }
            
            // Add bonus for high word overlap
            if (matchingWords >= Math.min(keepaWords.length, apiWords.length) * 0.7) {
                similarityScore = Math.min(10, similarityScore + 2);
            }
            
            // Debug logging for all scores
            console.log('Title Similarity Debug: Final result', {
                keepaTitle: keepaTitle.substring(0, 50) + '...',
                apiTitle: apiTitle.substring(0, 50) + '...',
                keepaWords: keepaWords.slice(0, 5),
                apiWords: apiWords.slice(0, 5),
                matchingWords,
                totalWords,
                similarityScore,
                finalScore: Math.min(10, Math.max(0, similarityScore))
            });
            
            return Math.min(10, Math.max(0, similarityScore));
        },
        formatNumber: function (value) {
            if (!value || isNaN(value)) return value;
            return parseInt(value).toLocaleString('de-DE'); // German format uses dots for thousands
        },
        formatDate: function (date) {
            if (!date) return 'N/A';
            const d = new Date(date);
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        },
        round: function (value, decimals) {
            if (isNaN(value)) return 0;
            return parseFloat(value).toFixed(decimals || 0);
        },
        multiply: function (a, b) {
            return parseFloat(a) * parseFloat(b);
        },
        divide: function (a, b) {
            if (parseFloat(b) === 0) return 0;
            return parseFloat(a) / parseFloat(b);
        },
        calculateAmazonPricesAverage: function (data) {
            // Clean and parse the values
            const cleanValue = (val) => {
                if (!val || val === '-' || val === 'N/A') return 0;
                const clean = String(val).replace(/[^\d.]/g, '');
                const parsed = parseFloat(clean);
                return isNaN(parsed) ? 0 : parsed;
            };
            
            const currentVal = cleanValue(data['New: Current']);
            const avg30dVal = cleanValue(data['New: 30 days avg.']);
            const avg180dVal = cleanValue(data['New: 180 days avg.']);
            
            const sum = currentVal + avg30dVal + avg180dVal;
            const count = (currentVal > 0 ? 1 : 0) + (avg30dVal > 0 ? 1 : 0) + (avg180dVal > 0 ? 1 : 0);
            
            return count > 0 ? (sum / count).toFixed(2) : '0.00';
        },
        calculateBuyBoxAverage: function (data) {
            // Clean and parse the values
            const cleanValue = (val) => {
                if (!val || val === '-' || val === 'N/A') return 0;
                const clean = String(val).replace(/[^\d.]/g, '');
                const parsed = parseFloat(clean);
                return isNaN(parsed) ? 0 : parsed;
            };
            
            const currentVal = cleanValue(data['Buy Box: Current']);
            const avg90dVal = cleanValue(data['Buy Box: 90 days avg.']);
            
            const sum = currentVal + avg90dVal;
            const count = (currentVal > 0 ? 1 : 0) + (avg90dVal > 0 ? 1 : 0);
            
            return count > 0 ? (sum / count).toFixed(2) : '0.00';
        },
        calculateProfitability: function (keepaData, shoppingPrice) {
            // Comprehensive debug logging
            console.log('=== CALCULATE PROFITABILITY DEBUG START ===');
            console.log('Input Parameters:');
            console.log('  keepaData:', keepaData ? 'Available' : 'Undefined');
            console.log('  shoppingPrice:', shoppingPrice);
            console.log('  keepaDataKeys:', keepaData ? Object.keys(keepaData).slice(0, 10) : 'No data');
            console.log('  keepaDataType:', typeof keepaData);
            console.log('  thisContext:', this ? 'Available' : 'Undefined');
            console.log('  thisKeys:', this ? Object.keys(this).slice(0, 10) : 'No this');
            
            // Try to get keepaData from different sources
            if (!keepaData) {
                console.log('keepaData is undefined, trying to find it in context...');
                // Try to get data from the current context
                if (this && this.Title) {
                    console.log('Found Keepa data in this context');
                    keepaData = this;
                } else if (this && this.parent && this.parent.Title) {
                    console.log('Found Keepa data in parent context');
                    keepaData = this.parent;
                } else {
                    console.log('No Keepa data found in any context');
                }
            }
            
            // Check if keepaData is available
            if (!keepaData) {
                console.log('calculateProfitability: No keepaData provided, returning default values');
                console.log('=== CALCULATE PROFITABILITY DEBUG END ===');
                return {
                    profit: '0.00',
                    isProfitable: false
                };
            }
            
            // Log the actual Keepa data values
            console.log('Keepa Data Values:');
            console.log('  Buy Box: Current:', keepaData['Buy Box: Current']);
            console.log('  Buy Box: 90 days avg.:', keepaData['Buy Box: 90 days avg.']);
            console.log('  New: Current:', keepaData['New: Current']);
            console.log('  New: 30 days avg.:', keepaData['New: 30 days avg.']);
            console.log('  New: 180 days avg.:', keepaData['New: 180 days avg.']);
            
            // Clean and parse the values
            const cleanValue = (val) => {
                if (!val || val === '-' || val === 'N/A') return 0;
                const clean = String(val).replace(/[^\d.]/g, '');
                const parsed = parseFloat(clean);
                return isNaN(parsed) ? 0 : parsed;
            };
            
            // Get the selling price from Keepa data
            const buyBoxCurrent = cleanValue(keepaData['Buy Box: Current']);
            const buyBox90DaysAvg = cleanValue(keepaData['Buy Box: 90 days avg.']);
            const amazonCurrent = cleanValue(keepaData['New: Current']);
            const amazon30DaysAvg = cleanValue(keepaData['New: 30 days avg.']);
            const amazon180DaysAvg = cleanValue(keepaData['New: 180 days avg.']);
            
            console.log('Parsed Values:');
            console.log('  buyBoxCurrent:', buyBoxCurrent);
            console.log('  buyBox90DaysAvg:', buyBox90DaysAvg);
            console.log('  amazonCurrent:', amazonCurrent);
            console.log('  amazon30DaysAvg:', amazon30DaysAvg);
            console.log('  amazon180DaysAvg:', amazon180DaysAvg);
            
            // Calculate averages
            let buyBoxAverage = 0;
            let validBuyBoxCount = 0;
            if (buyBoxCurrent > 0) validBuyBoxCount++;
            if (buyBox90DaysAvg > 0) validBuyBoxCount++;
            if (validBuyBoxCount > 0) {
                buyBoxAverage = (buyBoxCurrent + buyBox90DaysAvg) / validBuyBoxCount;
            }
            
            let amazonAverage = 0;
            let validAmazonCount = 0;
            if (amazonCurrent > 0) validAmazonCount++;
            if (amazon30DaysAvg > 0) validAmazonCount++;
            if (amazon180DaysAvg > 0) validAmazonCount++;
            if (validAmazonCount > 0) {
                amazonAverage = (amazonCurrent + amazon30DaysAvg + amazon180DaysAvg) / validAmazonCount;
            }
            
            console.log('Calculated Averages:');
            console.log('  buyBoxAverage:', buyBoxAverage);
            console.log('  amazonAverage:', amazonAverage);
            console.log('  validBuyBoxCount:', validBuyBoxCount);
            console.log('  validAmazonCount:', validAmazonCount);
            
            // Use Buy Box average if available, otherwise fall back to Amazon Prices average
            const sellingPrice = buyBoxAverage > 0 ? buyBoxAverage : amazonAverage;
            const shoppingPriceVal = cleanValue(shoppingPrice);
            
            console.log('Final Values:');
            console.log('  sellingPrice:', sellingPrice);
            console.log('  shoppingPriceVal:', shoppingPriceVal);
            
            if (sellingPrice <= 0 || shoppingPriceVal <= 0) {
                console.log('Invalid prices - returning default values');
                console.log('=== CALCULATE PROFITABILITY DEBUG END ===');
                return {
                    profit: '0.00',
                    isProfitable: false
                };
            }
            
            // Calculate fees: 8% if <$14.99, 15% if ≥$14.99 (based on selling price)
            const feeRate = sellingPrice < 14.99 ? 8 : 15;
            const fees = (sellingPrice * feeRate / 100);
            
            // Calculate total cost
            const shipping = 5.00;
            const totalCost = shoppingPriceVal + fees + shipping;
            
            // Calculate profit
            const profit = sellingPrice - totalCost;
            
            // Check if profitable (Profit >= $2)
            const isProfitable = profit >= 2.00;
            
            console.log('Profit Calculation:');
            console.log('  feeRate:', feeRate + '%');
            console.log('  fees:', fees);
            console.log('  shipping:', shipping);
            console.log('  totalCost:', totalCost);
            console.log('  profit:', profit);
            console.log('  isProfitable:', isProfitable);
            console.log('=== CALCULATE PROFITABILITY DEBUG END ===');
            
            return {
                profit: profit.toFixed(2),
                isProfitable: isProfitable
            };
        },
    }
}))

app.set('view engine', 'handlebars')

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

//Config Bootstrap
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || process.env.secret, // Usa SESSION_SECRET do GitHub, senão usa secret local
    resave: false,
    saveUninitialized: false
}));

//Config DB

//Body Parser
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// Test endpoint to check if authentication is working
app.get('/test', function (req, res) {
    res.json({ message: 'Test endpoint working', timestamp: new Date().toISOString() });
});

app.get("/", authenticate, function (req, res) {

});


app.get('/list', authenticate, async (req, res) => {
    try {
        const startTime = Date.now();
        
        // Add pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20; // Show 20 keepa_ids per page
        const offset = (page - 1) * limit;

        // OPTIMIZATION 1: Single query to get keepa_ids with basic stats
        const keepaRecords = await KeepaCSV.findAll({
            attributes: [
                'keepa_id', 
                [sequelize.fn('max', sequelize.col('createdAt')), 'max_created'],
                [sequelize.fn('count', sequelize.col('id')), 'totalProducts'],
                [sequelize.fn('count', sequelize.literal('CASE WHEN `New: Current` IS NOT NULL AND `New: Current` != "" AND `New: Current` != "-" THEN 1 END')), 'productsWithPrices'],
                [sequelize.fn('count', sequelize.literal('CASE WHEN `Sales Rank: Current` IS NOT NULL AND `Sales Rank: Current` != "" AND `Sales Rank: Current` != "-" AND `Sales Rank: Current` != 0 THEN 1 END')), 'profitableProducts'],
                [sequelize.fn('count', sequelize.literal('CASE WHEN `Sales Rank: Current` IS NOT NULL AND `Sales Rank: Current` != "" AND `Sales Rank: Current` != "-" AND `Sales Rank: Current` != 0 AND CAST(`Sales Rank: Current` AS UNSIGNED) <= 10000 THEN 1 END')), 'highRankProducts']
            ],
            group: ['keepa_id'],
            order: [[sequelize.literal('max_created'), 'DESC']],
            limit: limit,
            offset: offset
        });

        // OPTIMIZATION 2: Single query to get API analysis data for all keepa_ids
        const keepaIds = keepaRecords.map(record => record.keepa_id);
        const apiDataMap = {};
        
        if (keepaIds.length > 0) {
            const apiData = await apishopping.Api.findAll({
                where: { keepa_id: { [Op.in]: keepaIds } },
                attributes: ['keepa_id', 'id']
            });
            
            // Create a map for quick lookup
            apiData.forEach(api => {
                apiDataMap[api.keepa_id] = api.id;
            });
        }

        // OPTIMIZATION 3: Single query to get analyzed products count for all keepa_ids
        const analyzedProductsMap = {};
        if (Object.keys(apiDataMap).length > 0) {
            const apiIds = Object.values(apiDataMap);
            const analyzedProducts = await apishopping.Products.findAll({
                where: { api_id: { [Op.in]: apiIds } },
                attributes: [
                    'api_id',
                    [sequelize.fn('count', sequelize.col('id')), 'count']
                ],
                group: ['api_id']
            });
            
            // Create reverse map from api_id to keepa_id
            const apiIdToKeepaId = {};
            Object.entries(apiDataMap).forEach(([keepaId, apiId]) => {
                apiIdToKeepaId[apiId] = keepaId;
            });
            
            analyzedProducts.forEach(result => {
                const keepaId = apiIdToKeepaId[result.api_id];
                if (keepaId) {
                    analyzedProductsMap[keepaId] = parseInt(result.dataValues.count);
                }
            });
        }

        // OPTIMIZATION 4: Single query to get average prices for all keepa_ids
        const avgPriceMap = {};
        if (keepaIds.length > 0) {
            const avgPrices = await KeepaCSV.findAll({
                where: {
                    keepa_id: { [Op.in]: keepaIds },
                    'New: Current': {
                        [Op.not]: [null, '', '-']
                    }
                },
                attributes: [
                    'keepa_id',
                    [sequelize.fn('avg', sequelize.literal('CAST(REPLACE(REPLACE(`New: Current`, "$", ""), ",", ".") AS DECIMAL(10,2))')), 'avgPrice']
                ],
                group: ['keepa_id']
            });
            
            avgPrices.forEach(result => {
                avgPriceMap[result.keepa_id] = parseFloat(result.dataValues.avgPrice || 0).toFixed(2);
            });
        }

        // OPTIMIZATION 5: Build final stats array
        const keepaStats = keepaRecords.map(record => {
            const keepaId = record.keepa_id;
            const totalProducts = parseInt(record.dataValues.totalProducts);
            const analyzedProducts = analyzedProductsMap[keepaId] || 0;
            
            return {
                keepa_id: keepaId,
                totalProducts: totalProducts,
                productsWithPrices: parseInt(record.dataValues.productsWithPrices),
                avgPrice: avgPriceMap[keepaId] || '0.00',
                analyzedProducts: analyzedProducts,
                analysisPercentage: totalProducts > 0 ? Math.round((analyzedProducts / totalProducts) * 100) : 0,
                highRankProducts: parseInt(record.dataValues.highRankProducts),
                lastUpdated: record.dataValues.max_created,
                hasApiData: !!apiDataMap[keepaId]
            };
        });

        // OPTIMIZATION 6: Get total count for pagination (separate query)
        const { count: totalKeepaIds } = await KeepaCSV.findAndCountAll({
            attributes: ['keepa_id'],
            group: ['keepa_id']
        });

        // Calculate overall statistics
        const totalProducts = keepaStats.reduce((sum, stat) => sum + stat.totalProducts, 0);
        const totalAnalyzed = keepaStats.reduce((sum, stat) => sum + stat.analyzedProducts, 0);

        // Pagination info
        const totalPages = Math.ceil(totalKeepaIds.length / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        const endTime = Date.now();
        const processingTime = ((endTime - startTime) / 1000).toFixed(2);

        console.log(`List page loaded in ${processingTime}s - Page ${page}/${totalPages}`);

        // Send enhanced data to the client
        res.render('list', { 
            keepaStats: keepaStats,
            totalKeepaIds: totalKeepaIds.length,
            totalProducts: totalProducts,
            totalAnalyzed: totalAnalyzed,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                hasNextPage: hasNextPage,
                hasPrevPage: hasPrevPage,
                limit: limit
            },
            processingTime: processingTime
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error on List - ' + error.message);
    }
});

app.get('/gemini-analyze', authenticate, async (req, res) => {
    try {
        const keepaTitle = "TWIX Minis Size Caramel Chocolate Cookie Candy Bars, Party Size, 40 oz Bag"//req.query.keepaTitle; // Access parameters from req.query
        const keepaAvgOffer = 26.63;//req.query.keepaAvgOffer;
        const shoppingResultsJson = ` [
            {
            "position": 1,
            "title": "Twix Caramel Minis Chocolate Cookie Bar Candy",
            "product_link": "https://www.google.com/shopping/product/689286227614507268?gl=us&hl=en",
            "offers": "& more",
            "offers_link": "https://www.google.com/shopping/product/689286227614507268/offers?gl=us&hl=en&uule=w+CAIQICIjUmF5bmhhbSxNYXNzYWNodXNldHRzLFVuaXRlZCBTdGF0ZXM",
            "price": "4.99",
            "extracted_price": 4.99,
            "original_price": "4.99",
            "extracted_price": 4.99,
            "rating": 4.7,
            "reviews": 14000,
            "seller": "Target",
            "thumbnail": "https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcSydfSBhUnbcENTGhxubB4pyPe0pzJ83R3Du6fNQC0eJDC0uf5fiGyX7PUj4RfoV2-0opLzFuuG4uSaD20_b6BHI8NCRvyY"
            }]`;//req.query.shoppingResultsJson;

        const correctedJson = shoppingResultsJson.replace(/\u00A0/g, ' '); //Replace all non-breaking spaces with regular space
        const shoppingResults = JSON.parse(correctedJson);

        if (!keepaTitle || !keepaAvgOffer || !shoppingResultsJson) {
            return res.status(400).send('Missing required parameters');
        }

                        const analysisResult = await analyzeProduct(keepaTitle, keepaAvgOffer, shoppingResultsJson);
        console.log(analysisResult); // Log the result to the console.  You can render a template here instead
        res.send('Analysis complete. Check the console.');
    } catch (error) {
        console.error('Error during Gemini analysis:', error);
        res.status(500).send('Error during Gemini analysis');
    }
});



// !!! INSECURE - DO NOT USE IN PRODUCTION !!!
//const apiKey = process.env.GOOGLE_API_KEY; // Get API key from environment variables
/*
app.get('/generate', authenticate, async function (req, res) {
    // const prompt = req.query.prompt || "Explain how AI works";
    // try {
    //     const genAI = new GoogleGenerativeAI(apiKey);
    //     const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    //     const result = await model.generateContent(prompt);
    //     const generatedText = result.response.text();
    //     res.render('generatedText', { text: generatedText });
    // } catch (error) {
    //     console.error("Error:", error);
    //     res.status(500).send("Error generating text");
    // }

// !!! INSECURE - REPLACE WITH SECURE KEY MANAGEMENT !!!
    try {
      const { avgOffer, price, productTitle, seller, position, shoppingResults } = req.query;
  
      // Input validation (add more robust checks as needed)
      if (!avgOffer || !price || !productTitle || !seller || !position || !shoppingResults) {
        return res.status(400).send('Missing required parameters');
      }
  
      const formattedShoppingResults = JSON.parse(shoppingResults);

      const parts = [
          {
              text: `Analyze resale:
              Avg Offer: ${avgOffer}
              Cost: ${price}
              Fees: 8% (<$14.99), 15% else
              Shipping: $5
              Profit Min: $2
              ROI Min: 30%
              Nearby: Walmart,Target,BJ's Wholesale Club,Costco,CVS Pharmacy,Dollar General,Office Depot,Party City,Sam's Club,Shaw's,Staples,Stop & Shop,Walgreens.com, REI, DICK'S Sporting Goods, Ace Hardware, Cabela's

              Product:
              Title: ${productTitle}
              Seller: ${seller}
              Price: ${price}

              Instructions:

              1. From the PRODUCT TITLE, identify if the product is sold in a multi-pack. Look for keywords like "Pack of", "(# Bags)", "Count", "Individually Wrapped (#)".
              2. If a multi-pack is identified, extract the quantity per pack (#).
              3. Calculate the unit cost: ${price} / # (if multi-pack) or ${price} (if individual).
              4. Calculate total cost: unit cost * # (if multi-pack) or unit cost (if individual).
              5. Calculate Fees based on ${avgOffer}.
              6. Calculate Expenses: Shipping + Fees + Total Cost.
              7. Calculate Profit: ${avgOffer} - Expenses.
              8. Calculate ROI: (Profit / Total Cost) * 100.
              9. Is the product profitable (Profit >= Profit Min AND ROI >= ROI Min) AND sold at a nearby store?
              If yes, output JSON only:
                "Position": "${position} - ${seller}",
                "Expenses(Ship, Fee, Price)": "$5.00 + $[FEE] + [PRICE] = $[TOTAL_EXPENSES]",
                "Profit": "${avgOffer} - $[TOTAL_EXPENSES] = $[PROFIT_AMOUNT]",
                "ROI": "[ROI_PERCENTAGE]%"

              If the answer to question 9 is YES, output ONLY the following JSON:
              {
                "Position": "${position} - ${seller}",
                "Expenses(Ship, Fee, Price)": "$5.00 + $[FEE] + $[PRICE] = $[TOTAL_EXPENSES]",
                "Profit": "${avgOffer} - $[TOTAL_EXPENSES] = $[PROFIT_AMOUNT]",
                "ROI": "[ROI_PERCENTAGE]%"
              }

              If no:
              Does not meet criteria`
          },
          {
              text: `input: ${JSON.stringify(formattedShoppingResults)}`,
          },
      ];
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const generationConfig = {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: "text/plain",
      };
      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig,
      });
      res.render('generatedText', { text: result.response.text() });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send("Error generating text");
    }
  });
  
*/
const ITEMS_PER_PAGE = 50; // Total items per page
const INITIAL_LOAD = 50 ; // Load all items per page (original behavior)

// Utility function to clean and parse prices from CSV (handles European format with commas)
function cleanAndParsePrice(priceString) {
    if (!priceString || priceString === '' || priceString === '-') return 0;
    try {
        // Remove $, trim spaces, replace comma with dot for decimal separator
        const cleanPrice = priceString.replace('$', '').trim().replace(',', '.');
        const parsedPrice = parseFloat(cleanPrice);
        return isNaN(parsedPrice) ? 0 : parsedPrice;
    } catch (error) {
        console.error("Error parsing price:", priceString, error);
        return 0;
    }
}

app.get('/test-api', function (req, res) {
    res.json({ message: 'Test API endpoint working', timestamp: new Date().toISOString() });
});

app.get('/api/page/:page', async function (req, res) { // Make the route handler async


    try {
        var groupedProducts = null;
        const startTime = Date.now();

        const page = parseInt(req.params.page, 10) || 1;
        const offset = (page - 1) * ITEMS_PER_PAGE;
        const keepa_id = req.query.keepa_id; // Get the keepa_id from the query parameters

        // Get total count of products for the current keepa_id (for status bar)
        const { count: totalKeepaProducts } = await KeepaCSV.findAndCountAll({
            where: {
                keepa_id: keepa_id // Filter by the current keepa_id
            }
        });

        // Initially load only 1 item
        const { count, rows: keepaRecords } = await KeepaCSV.findAndCountAll({
            where: {
                keepa_id: keepa_id // Filter the results based on the keepa_id
            },
            offset: offset,
            limit: INITIAL_LOAD // Load only 1 item initially
        });

        const totalPages = Math.ceil(count / ITEMS_PER_PAGE);
        const startPage = Math.max(1, page - 2); // Calculate start and end pages for display
        const endPage = Math.min(totalPages, page + 2);

        const tblKeepa = keepaRecords.map(record => {
            const data = record.toJSON();
                         // Handle Sales Ranks - keep original values, just handle invalid values
             if (data['Sales Rank: Current'] && data['Sales Rank: Current'] !== '-' && !isNaN(data['Sales Rank: Current'])) {
                 data['Sales Rank: Current'] = data['Sales Rank: Current'].toString();
             } else {
                 data['Sales Rank: Current'] = 'N/A';
             }
             if (data['Sales Rank: 30 days avg.'] && data['Sales Rank: 30 days avg.'] !== '-' && !isNaN(data['Sales Rank: 30 days avg.'])) {
                 data['Sales Rank: 30 days avg.'] = data['Sales Rank: 30 days avg.'].toString();
             } else {
                 data['Sales Rank: 30 days avg.'] = 'N/A';
             }
             if (data['Sales Rank: 180 days avg.'] && data['Sales Rank: 180 days avg.'] !== '-' && !isNaN(data['Sales Rank: 180 days avg.'])) {
                 data['Sales Rank: 180 days avg.'] = data['Sales Rank: 180 days avg.'].toString();
             } else {
                 data['Sales Rank: 180 days avg.'] = 'N/A';
             }

            // Add the new columns

            let newCurrent = cleanAndParsePrice(data['New: Current']);
            let new30DaysAvg = cleanAndParsePrice(data['New: 30 days avg.']);
            let new180DaysAvg = cleanAndParsePrice(data['New: 180 days avg.']);

            // Calculate New Average - only if we have valid prices
            let newAverageRaw = 0;
            let validPriceCount = 0;
            if (newCurrent > 0) validPriceCount++;
            if (new30DaysAvg > 0) validPriceCount++;
            if (new180DaysAvg > 0) validPriceCount++;
            
            if (validPriceCount > 0) {
                newAverageRaw = (newCurrent + new30DaysAvg + new180DaysAvg) / validPriceCount;
                data['New: Average'] = newAverageRaw.toFixed(2);
            } else {
                data['New: Average'] = 'N/A';
            }


            let buyBoxCurrent = cleanAndParsePrice(data['Buy Box: Current']);
            let buyBox90DaysAvg = cleanAndParsePrice(data['Buy Box: 90 days avg.']);

            // Calculate Buy Box Average - only if we have valid prices
            let buyBoxAverageRaw = 0;
            let validBuyBoxPriceCount = 0;
            if (buyBoxCurrent > 0) validBuyBoxPriceCount++;
            if (buyBox90DaysAvg > 0) validBuyBoxPriceCount++;
            
            if (validBuyBoxPriceCount > 0) {
                buyBoxAverageRaw = (buyBoxCurrent + buyBox90DaysAvg) / validBuyBoxPriceCount;
                data['Buy Box: Average'] = buyBoxAverageRaw.toFixed(2);
            } else {
                data['Buy Box: Average'] = 'N/A';
            }


            // Calculate New Price Sellable - only if we have a valid average
            if (data['New: Average'] !== 'N/A' && newAverageRaw > 0) {
                const newPriceSellableRaw = newAverageRaw * 0.4;
                data['New: Price Sellable'] = newPriceSellableRaw.toFixed(2);
            } else {
                data['New: Price Sellable'] = 'N/A';
            }


            // Calculate Buy Box Price Sellable - only if we have a valid average
            if (data['Buy Box: Average'] !== 'N/A' && buyBoxAverageRaw > 0) {
                const buyBoxPriceSellableRaw = buyBoxAverageRaw * 0.4;
                data['Buy Box: Price Sellable'] = buyBoxPriceSellableRaw.toFixed(2);
            } else {
                data['Buy Box: Price Sellable'] = 'N/A';
            }


            return data;
        });
        

        //var { productsAPI} = await apishopping.feedTableProducts(tblKeepa);


        console.log('index - tblKeepa: ' + JSON.stringify(tblKeepa, null, 2));

        groupedProducts = [];
        var productsAPI = [];

        // Fetch Google Shopping data for each Keepa product
        groupedProducts = await Promise.all(
            tblKeepa.map(async (keepaRecord, keepaIndex) => {
                console.log(`\n--- STARTING PROCESSING FOR KEEPA RECORD ${keepaIndex + 1} ---`);
                console.log('Keepa Title:', keepaRecord.Title);
                console.log('Keepa ID:', keepaRecord.keepa_id);
                try {
                    console.log(`--- SEARCHING FOR EXISTING API DATA ---`);
                    var data = await apishopping.Api.findOne({
                        where: {
                            [Op.and]: [
                                { keepa_id: keepaRecord.keepa_id },
                                { q: keepaRecord.Title }
                            ]
                        },
                    });

                    var api_id = data ? data.id : null;
                    console.log(`Existing API data found: ${!!data}, API ID: ${api_id}`);
                    
                    if (!data) {
                        console.log(`--- INSERTING NEW API DATA ---`);
                        // 1. AWAIT the result of insertProductData:
                        newData = await apishopping.insertProductData(keepaRecord);
                        api_id = newData ? newData.id : null; // Update api_id
                        console.log(`New API data inserted: ${!!newData}, API ID: ${api_id}`);
                    }
                } catch (error) {
                    console.error(`Error processing API data for Keepa record ${keepaIndex + 1}:`, error);
                    api_id = null;
                }

                // 2. Fetch Products AFTER the API request and insert is complete:
                let productsAPI = []; // Initialize productsAPI here
                if (api_id) {
                    try {
                        console.log(`--- FETCHING PRODUCTS FOR API ID: ${api_id} ---`);
                        productsAPI = await apishopping.Products.findAll({
                            where: {
                                api_id: api_id
                            },
                            order: [
                                ['position', 'ASC'],
                            ]
                        });
                        console.log(`Products found: ${productsAPI.length}`);
                    } catch (error) {
                        console.error(`Error fetching products for API ID ${api_id}:`, error);
                        productsAPI = [];
                    }
                } else {
                    console.log('No API ID available, skipping product fetch');
                }

                // LOG: Print product information before analysis
                console.log('=== PRODUCT ANALYSIS LOG ===');
                console.log('Keepa Title:', keepaRecord.Title);
                console.log('Keepa New Current Price:', keepaRecord['New: Current']);
                console.log('Products found:', productsAPI.length);
                
                productsAPI.forEach((product, index) => {
                    console.log(`Product ${index + 1}:`);
                    console.log('  - Title:', product.title);
                    console.log('  - Seller:', product.seller);
                    console.log('  - Price:', product.price);
                });
                console.log('=== END PRODUCT ANALYSIS LOG ===');

                // SELLER PRE-FILTER: Check seller before sending to Gemini
                console.log('=== SELLER PRE-FILTER START ===');
                
                for (let i = 0; i < productsAPI.length; i++) {
                    const product = productsAPI[i];
                    const seller = product.seller;
                    
                    // Use the same isApprovedSeller function from apishopping.js
                    const sellerApproved = apishopping.isApprovedSeller(seller);
                    
                    if (sellerApproved) {
                        console.log(`Product ${i + 1} - Seller APPROVED: ${seller}`);
                    } else {
                        console.log(`Product ${i + 1} - Seller REJECTED: ${seller} - Motivo: Vendedor não aprovado`);
                        product.geminiStatus = "Reprovado";
                        product.geminiReason = "Vendedor reprovado";
                        product.geminiConfidence = 10; // High confidence for rule-based rejections
                    }
                }
                console.log('=== SELLER PRE-FILTER END ===');

                // PRICE PRE-FILTER: Check if product price is within profitable range
                console.log('=== PRICE PRE-FILTER START ===');
                console.log('Keepa New Current Price:', keepaRecord['New: Current']);
                
                // Check if we have valid Keepa price data
                const hasValidKeepaPrice = keepaRecord['New: Current'] && 
                                         keepaRecord['New: Current'] !== '' && 
                                         keepaRecord['New: Current'] !== '-' && 
                                         keepaRecord['New: Current'] !== null;
                
                if (!hasValidKeepaPrice) {
                    console.log('No valid Keepa price data available - Skipping price pre-filter');
                    console.log('Products will proceed to Gemini analysis based on seller approval only');
                }
                
                for (let i = 0; i < productsAPI.length; i++) {
                    const product = productsAPI[i];
                    
                    // Skip price check if seller was already rejected
                    if (product.geminiStatus === "Reprovado") {
                        console.log(`Product ${i + 1} - Skipping price check (seller rejected): ${product.title}`);
                        continue;
                    }
                    
                    // Skip price check if no valid Keepa price data
                    if (!hasValidKeepaPrice) {
                        console.log(`Product ${i + 1} - Skipping price check (no Keepa price data): ${product.title}`);
                        continue;
                    }
                    
                    const amazonPrice = cleanAndParsePrice(keepaRecord['New: Current']);
                    const shoppingPrice = cleanAndParsePrice(product.price);
                    
                    console.log(`Product ${i + 1} - Raw Price Data:`);
                    console.log(`  Raw Amazon Price: "${keepaRecord['New: Current']}"`);
                    console.log(`  Raw Shopping Price: "${product.price}"`);
                    console.log(`  Parsed Amazon Price: ${amazonPrice}`);
                    console.log(`  Parsed Shopping Price: ${shoppingPrice}`);
                    
                    // Calculate maximum allowed cost
                    const maxAllowedCost = amazonPrice - (amazonPrice * 0.15) - 5.00 - 2.00;
                    
                    console.log(`Product ${i + 1} - Price Analysis:`);
                    console.log(`  Amazon Price: $${amazonPrice.toFixed(2)}`);
                    console.log(`  Shopping Price: $${shoppingPrice.toFixed(2)}`);
                    console.log(`  Custo Máximo = $${amazonPrice.toFixed(2)} - ($${amazonPrice.toFixed(2)} * 0.15) - 5.00 - 2.00 = $${maxAllowedCost.toFixed(2)}`);
                    
                    if (shoppingPrice <= maxAllowedCost) {
                        console.log(`Product ${i + 1} - Price APPROVED: $${shoppingPrice.toFixed(2)} <= $${maxAllowedCost.toFixed(2)}`);
                    } else {
                        console.log(`Product ${i + 1} - Price REJECTED: $${shoppingPrice.toFixed(2)} > $${maxAllowedCost.toFixed(2)} - Motivo: Preço muito alto`);
                        product.geminiStatus = "Reprovado";
                        product.geminiReason = "Preço muito alto";
                        product.geminiConfidence = 10; // High confidence for rule-based rejections
                    }
                }
                console.log('=== PRICE PRE-FILTER END ===');

                // GEMINI ANALYSIS: Only analyze products with approved sellers and prices
                console.log('=== GEMINI ANALYSIS START ===');
                console.log('Keepa Title for Analysis:', keepaRecord.Title);
                for (let i = 0; i < productsAPI.length; i++) {
                    const product = productsAPI[i];
                    
                    // Skip Gemini analysis if seller or price was already rejected
                    if (product.geminiStatus === "Reprovado") {
                        console.log(`Product ${i + 1} - Skipping Gemini (seller/price rejected): ${product.title}`);
                        // Set confidence score for skipped products
                        if (!product.geminiConfidence) {
                            product.geminiConfidence = 10; // High confidence for rule-based rejections
                        }
                        continue;
                    }
                    
                    try {
                        console.log(`\n--- Analyzing Product ${i + 1} with Gemini ---`);
                        console.log('Product Title:', product.title);
                        const geminiResult = await analyzeTitles(keepaRecord.Title, product.title);
                        product.geminiStatus = geminiResult.status;
                        product.geminiReason = geminiResult.reason;
                        product.geminiConfidence = geminiResult.confidenceScore;
                        console.log(`Gemini Result: "${geminiResult.status}" - Motivo: "${geminiResult.reason}" - Confidence: ${geminiResult.confidenceScore}/10`);
                        console.log(`Final Status: ${geminiResult.status}`);
                        console.log(`Final Reason: ${geminiResult.reason}`);
                        console.log(`Confidence Score: ${geminiResult.confidenceScore}/10`);
                        console.log(`Product geminiStatus set to: ${product.geminiStatus}`);
                        console.log(`Product geminiReason set to: ${product.geminiReason}`);
                        console.log(`Product geminiConfidence set to: ${product.geminiConfidence}`);
                    } catch (error) {
                        console.error(`Error in Gemini analysis for product ${i + 1}:`, error);
                        product.geminiStatus = "Reprovado";
                        product.geminiReason = "Erro na análise";
                        product.geminiConfidence = 1; // Very low confidence for errors
                    }
                }
                console.log('=== GEMINI ANALYSIS END ===');

                //custom title with emojis
                let emojiX = true;
                const avgKeepaPrice = apishopping.avgPriceKeepa(keepaRecord)
                const weightKeepa = apishopping.getWeight(keepaRecord.Title);
                const unitKeepa = apishopping.getUnitCount(keepaRecord.Title);
                console.log('avg ' + avgKeepaPrice + ' u' + unitKeepa + ' w' + weightKeepa + ' t' + keepaRecord.Title)

                

                console.log(`--- FINAL RESULT FOR KEEPA RECORD ${keepaIndex + 1} ---`);
                console.log('Keepa Title:', keepaRecord.Title);
                console.log('Products API Count:', productsAPI.length);
                console.log('Products API:', productsAPI.map(p => ({ title: p.title, seller: p.seller })));
                
                return {
                    ...keepaRecord,
                    productsAPI,
                };
            })

        ).then((groupedProducts) => {

            // let emojiX = true;
            // const avgKeepaPrice = apishopping.avgPriceKeepa(keepaRecord)
            // const weightKeepa = apishopping.getWeight(keepaRecord.Title);
            // const unitKeepa = apishopping.getUnitCount(keepaRecord.Title);
            // productsAPI.map((productRecord, productIndex) => {
            // });
            //console.log('index - groupedProducts: ' + JSON.stringify(groupedProducts, null, 2));

            // Calculate total processing time in seconds
            const endTime = Date.now();
            const totalTime = ((endTime - startTime) / 1000).toFixed(2);
            
            // Log final data for debugging
            console.log('=== FINAL TEMPLATE DATA ===');
            console.log('GroupedProducts length:', groupedProducts.length);
            groupedProducts.forEach((group, groupIndex) => {
                console.log(`Group ${groupIndex + 1}:`);
                group.productsAPI.forEach((product, productIndex) => {
                    console.log(`  Product ${productIndex + 1}:`, {
                        title: product.title,
                        seller: product.seller,
                        geminiStatus: product.geminiStatus
                    });
                });
            });
            console.log('=== END FINAL TEMPLATE DATA ===');
            
            res.render('apishopping', {
                tblKeepa: groupedProducts,
                apiRequestsComplete: true,
                totalTime: totalTime,
                currentPage: page,
                totalPages: totalPages,
                startPage: startPage,
                endPage: endPage,
                keepa_id: keepa_id,
                totalKeepaProducts: totalKeepaProducts,
            });
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error fetching data - ' + error.message);
    }
});

app.get('/register', (req, res) => {
    res.render('register');
});
app.post('/register', async (req, res) => {
    try {

        const { username, password } = req.body;

        // Hash the password:
        const hashedPassword = await bcryptjs.hash(password, 10); // 10 is the salt rounds (adjust if needed)


        const user = await User.create({
            username: username,
            password: hashedPassword // Store the hashed password 
        });

        // ... redirect or send a success response ...
        res.redirect('/login');

        //return res.status(401).send('Error to create.');

    } catch (error) {
        return res.status(401).send('Error to create.');
    }
});

function authenticate(req, res, next) {
    if (req.session.user) {
        next(); // User is logged in, proceed
    } else {
        res.redirect('/login'); // Redirect to login if not authenticated
    }
}

app.get('/login', (req, res) => {
    res.render('login');
});


app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find the user in the database (replace with your actual User model and query)
        const user = await User.findOne({ where: { username: username } });

        if (!user) {
            return res.status(401).send('Invalid username or password.');
        }

        // Compare passwords using bcryptjs:
        const passwordMatch = await bcryptjs.compare(password, user.password);

        if (passwordMatch) {
            // Set user session:
            req.session.user = {
                id: user.id,
                username: user.username
            };
            res.redirect('/list'); // Redirect to your protected page
        } else {
            res.status(401).send('Invalid username or password.');
        }
    } catch (error) {
        // ... error handling ...
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});


app.get("/keepa", authenticate, function (req, res) {
    res.render('keepa');

});


// Function to remove emojis from strings
function removeEmojis(str) {
    if (!str) return str;
    return str.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
}

app.post('/upload', authenticate, upload.single('keepaCSV'), async (req, res) => {
    // try {
    //     const csvFilePath = req.file.path;

    //     // Parse CSV data
    //     parse(fs.readFileSync(csvFilePath), {
    //         columns: true,
    //         skip_empty_lines: true
    //     }, async (err, records) => {
    //         if (err) {
    //             res.send("Erro Upload: " + err);
    //         }
    //         const keepa_id = path.basename(req.file.originalname, '.csv'); // Remove .csv extension
    //         //uuidv4();
    //         // Insert records into database
    //         if (records)
    //             for (const record of records) {
    //                 record.Image = Object.values(record).toString().split('.jpg')[0] + '.jpg';
    //                 record.keepa_id = keepa_id;
    //                 await KeepaCSV.create(record);

    //             }
    //         //console.log('Sucesso no Upload');
    //         res.redirect('/list');
    //         // ... (success response) ...
    //     });

    // } catch (error) {
    //     res.send("Erro Upload: " + error);
    //     console.log("Erro Upload: " + error);
    // }

    try {
        const csvFilePath = req.file.path;
        const keepa_id = path.basename(req.file.originalname, '.csv');
        let processedLines = 0;
        let failedLines = 0;
        let errorMessages = [];

        // Read file and remove BOM if present
        let csvContent = fs.readFileSync(csvFilePath, 'utf8');
        // Remove UTF-8 BOM if present
        if (csvContent.charCodeAt(0) === 0xFEFF) {
            csvContent = csvContent.slice(1);
        }
        
        parse(csvContent, {
            columns: true,
            skip_empty_lines: true
        }, async (err, records) => {
            // Clean headers by removing emojis
            if (records && records.length > 0) {
                const firstRecord = records[0];
                const cleanedRecords = records.map(record => {
                    const cleanedRecord = {};
                    Object.keys(record).forEach(key => {
                        const cleanedKey = removeEmojis(key);
                        cleanedRecord[cleanedKey] = record[key];
                    });
                    return cleanedRecord;
                });
                records = cleanedRecords;
            }
            if (err) {
                console.error("Error 500 - CSV parsing error:", err);
                res.status(500).json({
                    message: "Error 500 - Error parsing CSV file.",
                    details: err.message,
                    redirect: '/list' // Add redirect suggestion
                });
                return;
            }

            if (records) {
                for (const record of records) {
                    try {
                        //processing lines from file
                        // Skip to next line if Title is empty
                        if (!record.Title || record.Title.trim() === '') {
                            console.warn(`Skipping line ${processedLines + 1} due to missing Title.`);
                            continue; // Go to the next iteration of the loop
                        }
                        record.Image = Object.values(record).toString().split('.jpg')[0] + '.jpg';
                        record.keepa_id = keepa_id;
                        // Validate and parse integer columns
                        record['Sales Rank: Current'] = validateAndParseInt(record['Sales Rank: Current']);
                        record['Sales Rank: 30 days avg.'] = validateAndParseInt(record['Sales Rank: 30 days avg.']);
                        record['Sales Rank: 180 days avg.'] = validateAndParseInt(record['Sales Rank: 180 days avg.']);
                        record['Variation Count'] = validateAndParseInt(record['Variation Count']);
                        record['Reviews: Ratings - Format Specific'] = record['Reviews: Ratings - Format Specific'] === '' ? null : parseFloat(record['Reviews: Ratings - Format Specific']);
                        record['Reviews: Review Count - Format Specific'] = validateAndParseInt(record['Reviews: Review Count - Format Specific']);
                        record['New Offer Count: 30 days avg.'] = validateAndParseInt(record['New Offer Count: 30 days avg.']);
                        record['New Offer Count: 180 days avg.'] = validateAndParseInt(record['New Offer Count: 180 days avg.']);
                        record['Bought in past month'] = validateAndParseInt(record['Bought in past month']);

                        await KeepaCSV.create(record);
                        processedLines++;
                    } catch (error) {
                        failedLines++;
                        errorMessages.push({ line: processedLines + 1, error: error.message });
                        console.error(`Error processing line ${processedLines + 1}:`, error);
                        processedLines++;
                    }
                }
            }

            if (failedLines > 0) {
                // If there were errors, send the error information
                try {
                    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CSV Upload Results</title>
    </head>
    <body>
      <h1>CSV Upload Results</h1>
      <p>Processed Lines: ${processedLines}</p>
      <p>Failed Lines: ${failedLines}</p>
      <a href="${'/list'}">Go to List</a>
      <h2>Errors:</h2>
      <ul>
        ${errorMessages.map(error => `<li>Line ${error.line}: ${error.error}</li>`).join('')}
      </ul>
  
      <a href="${'/list'}">Go to List</a>
    </body>
    </html>
  `);
                }
                catch {
                    res.status(200).json({
                        message: "CSV upload complete with errors.",
                        processed: processedLines,
                        failed: failedLines,
                        errors: errorMessages,
                        link: '/list', // Send just the URL, not the full HTML
                    });
                }




            } else {
                // If no errors, redirect to '/list'
                res.redirect('/list');
            }

            //res.redirect('/list');
        });

    } catch (error) {
        console.error("General error during upload:", error);
        res.status(500).json({
            message: "Error during CSV upload.",
            details: error.message,
            redirect: '/list'
        });
    }
});

// Helper function to validate and parse integers
function validateAndParseInt(value) {
    if (value === '' || value === null || isNaN(value)) {
        return null; // Or you can set a default value like 0 
    } else {
        return parseInt(value, 10);
    }
}

// API endpoint for loading additional items




app.listen(8081, function () {
    console.log('Servidor Rodando');
});

