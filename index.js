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
const wholesaleModule = require('./models/wholesale'); // Import your new module
const WholesaleProduct = wholesaleModule.WholesaleProduct; // Get the model
const AmazonWholesaleResult = wholesaleModule.AmazonWholesaleResult; // Get the model
const processWholesaleProductsForAmazon = wholesaleModule.processWholesaleProductsForAmazon; // Get the function

// ... rest of your index.js ...



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
        range: function(start, end) {
            const result = [];
            for (let i = start; i <= end; i++) {
                result.push(i);
            }
            return result;
        },
        inc: function (value) {
            return parseInt(value, 10) + 1; // Ensure value is a number
        },
        add: function (a, b, options) {
            return parseInt(a, 10) + parseInt(b, 10);
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
            if_eq: function (a, b, options) {
            if (a == b) {
                return options.fn(this);
            }
            return options.inverse(this);
        },
        if_gt: function (a, b, options) {
            if (a > b) {
                return options.fn(this);
            }
            return options.inverse(this);
        },
        if_lt: function (a, b, options) {
            if (a < b) {
                return options.fn(this);
            }
            return options.inverse(this);
        },
        formatNumber: function (number, decimals) {
            if (number === null || number === undefined || number === '') return '0';
            const parsed = parseFloat(number);
            if (isNaN(parsed)) return '0';
            return parsed.toFixed(decimals || 2);
        },
        json: function (context) {
            return JSON.stringify(context);
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
    secret: process.env.secret, // Replace with a strong, random secret
    resave: false,
    saveUninitialized: false
}));

//Config DB

//Body Parser
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.get("/", authenticate, function (req, res) {

});


app.get('/list', authenticate, async (req, res) => {
    try {
        // const keepaRecords = await KeepaCSV.findAll({
        //     attributes: ['keepa_id'], // Only fetch keepa_id
        //     group: ['keepa_id'], // Group by keepa_id to avoid duplicates
        //     order: [['createdAt', 'DESC']], // Order by keepa_id in ascending order

        // });

        const keepaRecords = await KeepaCSV.findAll({
            attributes: ['keepa_id', [sequelize.fn('max', sequelize.col('createdAt')), 'max_created']],
            group: ['keepa_id'],
            order: [[sequelize.literal('max_created'), 'DESC']]
        });

        // Convert the records to a simple array of keepa_id strings
        const keepaIds = keepaRecords.map(record => record.keepa_id);

        // Send the keepaIds to the client
        res.render('list', { keepaIds: keepaIds });
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
const ITEMS_PER_PAGE = 10;

app.get('/api/page/:page', authenticate, async function (req, res) { // Make the route handler async


    try {
        var groupedProducts = null;
        const startTime = Date.now();

        const page = parseInt(req.params.page, 10) || 1;
        const offset = (page - 1) * ITEMS_PER_PAGE;
        const keepa_id = req.query.keepa_id; // Get the keepa_id from the query parameters

        const { count, rows: keepaRecords } = await KeepaCSV.findAndCountAll({
            where: {
                keepa_id: keepa_id // Filter the results based on the keepa_id
            },
            offset: offset,
            limit: ITEMS_PER_PAGE
        });

        const totalPages = Math.ceil(count / ITEMS_PER_PAGE);
        const startPage = Math.max(1, page - 2); // Calculate start and end pages for display
        const endPage = Math.min(totalPages, page + 2);

        const tblKeepa = keepaRecords.map(record => {
            const data = record.toJSON();
            if (data['Sales Rank: Current']) {
                data['Sales Rank: Current'] = (data['Sales Rank: Current'] / 1000).toFixed(3);
            }
            if (data['Sales Rank: 30 days avg.']) {
                data['Sales Rank: 30 days avg.'] = (data['Sales Rank: 30 days avg.'] / 1000).toFixed(3);
            }
            if (data['Sales Rank: 180 days avg.']) {
                data['Sales Rank: 180 days avg.'] = (data['Sales Rank: 180 days avg.'] / 1000).toFixed(3);
            }

            // Add the new columns

            let newCurrent;
            try {
                newCurrent = Number(data['New: Current'].replace('$', ''));
            } catch (error) {
                console.error("Error processing 'New: Current':", error);
                newCurrent = 0; // Default or handle error as needed
            }

            let new30DaysAvg;
            try {
                new30DaysAvg = Number(data['New: 30 days avg.'].replace('$', ''));
            } catch (error) {
                console.error("Error processing 'New: 30 days avg.':", error);
                new30DaysAvg = 0; // Default or handle error as needed
            }

            let new180DaysAvg;
            try {
                new180DaysAvg = Number(data['New: 180 days avg.'].replace('$', ''));
            } catch (error) {
                console.error("Error processing 'New: 180 days avg.':", error);
                new180DaysAvg = 0; // Default or handle error as needed
            }

            let newAverageRaw = (newCurrent + new30DaysAvg + new180DaysAvg) / 3;
            try {
                data['New: Average'] = newAverageRaw.toFixed(2);
            } catch (error) {
                console.error("Error processing 'New: Average' toFixed:", error);
                data['New: Average'] = 0; // Default or handle error as needed
            }


            let buyBoxCurrent;
            try {
                buyBoxCurrent = Number(data['Buy Box: Current'].replace('$', ''));
            } catch (error) {
                console.error("Error processing 'Buy Box: Current':", error);
                buyBoxCurrent = 0; // Default or handle error as needed
            }

            let buyBox90DaysAvg;
            try {
                buyBox90DaysAvg = Number(data['Buy Box: 90 days avg.'].replace('$', ''));
            } catch (error) {
                console.error("Error processing 'Buy Box: 90 days avg.':", error);
                buyBox90DaysAvg = 0; // Default or handle error as needed
            }

            let buyBoxAverageRaw = (buyBoxCurrent + buyBox90DaysAvg) / 2;
            try {
                data['Buy Box: Average'] = buyBoxAverageRaw.toFixed(2);
            } catch (error) {
                console.error("Error processing 'Buy Box: Average' toFixed:", error);
                data['Buy Box: Average'] = 0; // Default or handle error as needed
            }


            let newPriceSellableRaw;
            try {
                newPriceSellableRaw = Number(data['New: Average']) * 0.4;
            } catch (error) {
                console.error("Error processing 'New: Average' for sellable calculation:", error);
                newPriceSellableRaw = 0;
            }
            try {
                data['New: Price Sellable'] = Number(newPriceSellableRaw.toFixed(2));
            } catch (error) {
                console.error("Error processing 'New: Price Sellable' toFixed:", error);
                data['New: Price Sellable'] = 0; // Default or handle error as needed
            }


            let buyBoxPriceSellableRaw;
            try {
                buyBoxPriceSellableRaw = Number(data['Buy Box: Average']) * 0.4;
            } catch (error) {
                console.error("Error processing 'Buy Box: Average' for sellable calculation:", error);
                buyBoxPriceSellableRaw = 0;
            }
            try {
                data['Buy Box: Price Sellable'] = Number(buyBoxPriceSellableRaw.toFixed(2));
            } catch (error) {
                console.error("Error processing 'Buy Box: Price Sellable' toFixed:", error);
                data['Buy Box: Price Sellable'] = 0; // Default or handle error as needed
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
                var data = await apishopping.Api.findOne({
                    where: {
                        [Op.and]: [
                            { keepa_id: keepaRecord.keepa_id },
                            { q: keepaRecord.Title }
                        ]
                    },
                });

                var api_id = data ? data.id : null;
                if (!data) {
                    // 1. AWAIT the result of insertProductData:
                    newData = await apishopping.insertProductData(keepaRecord);
                    api_id = newData ? newData.id : null; // Update api_id
                }

                // 2. Fetch Products AFTER the API request and insert is complete:
                let productsAPI = []; // Initialize productsAPI here
                if (api_id) {
                    console.log('api_id: ' + api_id);
                    productsAPI = await apishopping.Products.findAll({
                        where: {
                            api_id: api_id
                        },
                        order: [
                            ['position', 'ASC'],
                        ]
                    });
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
                const approvedSellers = [
                    'Ace Hardware', 'Best Buy', 'BJ\'s', 'CVS', 'Dick\'s Sporting Goods', 
                    'Dollar General', 'Dollar Tree', 'Family Dollar', 'GameStop', 'Five Below', 
                    'The Home Depot', 'Kohl\'s', 'Lowe\'s', 'Macy\'s', 'Michael\'s', 'PetSmart', 
                    'Rite Aid', 'Rhode Island Novelty', 'Sam\'s Club', 'Staples', 'Target', 
                    'VitaCost', 'Walmart', 'Walgreens'
                ];
                
                for (let i = 0; i < productsAPI.length; i++) {
                    const product = productsAPI[i];
                    const seller = product.seller;
                    
                    // Check if seller is approved
                    let sellerApproved = false;
                    if (seller) {
                        const normalizedSeller = seller.trim();
                        sellerApproved = approvedSellers.some(approved => 
                            normalizedSeller.toLowerCase().includes(approved.toLowerCase())
                        );
                    }
                    
                    if (sellerApproved) {
                        console.log(`Product ${i + 1} - Seller APPROVED: ${seller}`);
                    } else {
                        console.log(`Product ${i + 1} - Seller REJECTED: ${seller} - Motivo: Vendedor não aprovado`);
                        product.geminiStatus = "Reprovado";
                        product.geminiReason = "Vendedor não aprovado";
                    }
                }
                console.log('=== SELLER PRE-FILTER END ===');

                // PRICE PRE-FILTER: Check if product price is within profitable range
                console.log('=== PRICE PRE-FILTER START ===');
                console.log('Keepa New Current Price:', keepaRecord['New: Current']);
                
                for (let i = 0; i < productsAPI.length; i++) {
                    const product = productsAPI[i];
                    
                    // Skip price check if seller was already rejected
                    if (product.geminiStatus === "Reprovado") {
                        console.log(`Product ${i + 1} - Skipping price check (seller rejected): ${product.title}`);
                        continue;
                    }
                    
                    const amazonPrice = parseFloat(keepaRecord['New: Current'].replace('$', ''));
                    const shoppingPrice = parseFloat(product.price.replace('$', ''));
                    
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
                        continue;
                    }
                    
                    try {
                        console.log(`\n--- Analyzing Product ${i + 1} with Gemini ---`);
                        console.log('Product Title:', product.title);
                        const geminiResult = await analyzeTitles(keepaRecord.Title, product.title);
                        product.geminiStatus = geminiResult.status;
                        product.geminiReason = geminiResult.reason;
                        console.log(`Gemini Result: "${geminiResult.status}" - Motivo: "${geminiResult.reason}"`);
                        console.log(`Final Status: ${geminiResult.status}`);
                        console.log(`Final Reason: ${geminiResult.reason}`);
                        console.log(`Product geminiStatus set to: ${product.geminiStatus}`);
                        console.log(`Product geminiReason set to: ${product.geminiReason}`);
                    } catch (error) {
                        console.error(`Error in Gemini analysis for product ${i + 1}:`, error);
                        product.geminiStatus = "Reprovado";
                        product.geminiReason = "Erro na análise";
                    }
                }
                console.log('=== GEMINI ANALYSIS END ===');

                //custom title with emojis
                let emojiX = true;
                const avgKeepaPrice = apishopping.avgPriceKeepa(keepaRecord)
                const weightKeepa = apishopping.getWeight(keepaRecord.Title);
                const unitKeepa = apishopping.getUnitCount(keepaRecord.Title);
                console.log('avg ' + avgKeepaPrice + ' u' + unitKeepa + ' w' + weightKeepa + ' t' + keepaRecord.Title)

                productsAPI.forEach((apiRecord, productIndex) => {
                    //if (productsAPI[keepaIndex].title != 'No Results') {
                    if (productsAPI[keepaIndex] !== undefined && productsAPI[keepaIndex].title !== undefined && productsAPI[keepaIndex].title.trim() !== '') {
                        let check = 0;
                        const apiWeigth = apishopping.getWeight(apiRecord.title);
                        let originalTitle = apiRecord.title;
                        apiRecord.title = " " + apiRecord.title;
                        let storePrice = 0;
                        try {
                             storePrice = parseFloat(apiRecord.price.replace('$', '')) * unitKeepa * 2;
                        } catch (error) {
                            console.error("Error processing 'storePrice':", error);
                            storePrice = 0; // Default or handle error as needed
                        }
                        //console.log('storePrice ' + storePrice + ' avg ' + avgKeepaPrice + ' w' + weightKeepa + ' t' + apiRecord.title)
                        //check Prices
                        if (storePrice > 0)
                        if (storePrice < avgKeepaPrice) {
                            apiRecord.title = "💰" + apiRecord.title;
                            check += 1;
                        } else apiRecord.title = "📛" + apiRecord.title;

                        if (weightKeepa * 0.75 < apiWeigth && weightKeepa * 1.25 > apiWeigth) {
                            apiRecord.title = "⚖️" + apiRecord.title;
                            check += 1;
                        }
                        //It`s a good product ✅
                        if (check === 2)
                            apiRecord.title = "✅ " + originalTitle;

                        if ((weightKeepa != null && avgKeepaPrice > 0) && check === 0)
                            apiRecord.title = "❌" + apiRecord.title // Has the information and don't match
                        else if (weightKeepa === null || avgKeepaPrice === 0)// IF Doesn't has the information
                            if (emojiX) {//We can't check(don't have all info)"⚠️"
                                tblKeepa[keepaIndex].Title = "⚠️" + tblKeepa[keepaIndex].Title;//apiRecord.title = "⚠️" + apiRecord.title
                                emojiX = false;
                            }
                    }
                });

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

            // Calculate total processing time
            const endTime = Date.now();
            const totalTime = (endTime - startTime) / 1000;
            
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
            });
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error fetching data - ' + error.message);
    }
});

app.get('/register', (req, res) => {
    res.render('register', {
        layout: false // Don't use the main layout
    });
});
app.post('/register', async (req, res) => {
    try {
        const { username, password, confirmPassword } = req.body;

        // Validate password confirmation
        if (password !== confirmPassword) {
            return res.render('register', { 
                error: 'Passwords do not match.',
                layout: false // Don't use the main layout
            });
        }

        // Check if username already exists
        const existingUser = await User.findOne({ where: { username: username } });
        if (existingUser) {
            return res.render('register', { 
                error: 'Username already exists.',
                layout: false // Don't use the main layout
            });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.render('register', { 
                error: 'Password must be at least 8 characters long.',
                layout: false // Don't use the main layout
            });
        }

        // Hash the password:
        const hashedPassword = await bcryptjs.hash(password, 10);

        const user = await User.create({
            username: username,
            password: hashedPassword
        });

        // Redirect to login with success message
        res.redirect('/login?success=Account created successfully! Please log in.');

    } catch (error) {
        console.error('Registration error:', error);
        res.render('register', { 
            error: 'Error creating account. Please try again.',
            layout: false // Don't use the main layout
        });
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
    const success = req.query.success;
    res.render('login', { 
        success: success,
        layout: false // Don't use the main layout
    });
});

app.get('/dashboard', authenticate, async (req, res) => {
    try {
        // Get basic stats for the dashboard
        const stats = {
            keepaCount: 0,
            wholesaleCount: 0,
            analysisCount: 0
        };
        
        // You can add actual database queries here to get real stats
        // For now, we'll use placeholder values
        
        res.render('dashboard', {
            user: req.session.user,
            stats: stats,
            page: 'dashboard'
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('dashboard', {
            user: req.session.user,
            stats: null,
            page: 'dashboard'
        });
    }
});


app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find the user in the database (replace with your actual User model and query)
        const user = await User.findOne({ where: { username: username } });

        if (!user) {
            return res.render('login', { 
                error: 'Invalid username or password.',
                layout: false // Don't use the main layout
            });
        }

        // Compare passwords using bcryptjs:
        const passwordMatch = await bcryptjs.compare(password, user.password);

        if (passwordMatch) {
            // Set user session:
            req.session.user = {
                id: user.id,
                username: user.username
            };
            res.redirect('/dashboard'); // Redirect to dashboard
        } else {
            res.render('login', { 
                error: 'Invalid username or password.',
                layout: false // Don't use the main layout
            });
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

        parse(fs.readFileSync(csvFilePath), {
            columns: true,
            skip_empty_lines: true
        }, async (err, records) => {
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



app.listen(8081, authenticate, function () {
    console.log('Servidor Rodando');
});

// New route for wholesale CSV upload
app.get("/wholesale", authenticate, function (req, res) {
    res.render('wholesale', { page: 'wholesale_upload' });
});

// POST route to handle the wholesale CSV upload with flexible column mapping
app.post('/upload-wholesale', authenticate, upload.single('wholesaleCSV'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const csvFilePath = req.file.path;
    const wholesale_id = path.basename(req.file.originalname, path.extname(req.file.originalname));

    // Get column mapping from form data
    const columnMapping = {
        title: req.body.titleColumn || null,
        cost: req.body.costColumn || null,
        costDollar: req.body.costDollarColumn || null,
        costCents: req.body.costCentsColumn || null,
        thumbnail: req.body.thumbnailColumn || null,
        hyperlink: req.body.hyperlinkColumn || null,
        brand: req.body.brandColumn || null,
        size: req.body.sizeColumn || null,
        item: req.body.itemColumn || null
    };

    // Debug: Log the column mapping
    console.log('=== COLUMN MAPPING DEBUG ===');
    console.log('Column mapping:', JSON.stringify(columnMapping, null, 2));
    console.log('Form body:', JSON.stringify(req.body, null, 2));
    console.log('=== END COLUMN MAPPING DEBUG ===');

    let processedLines = 0;
    let failedLines = 0;
    const errorMessages = [];

    const fileStream = fs.createReadStream(csvFilePath);

    const parser = parse({
        columns: true, // Use headers to get column names
        skip_empty_lines: true,
        trim: true, // Trim whitespace from values
        skip_records_with_empty_values: false // Don't skip records with empty values
    });

    fileStream.pipe(parser)
        .on('data', async (record) => {
            try {
                // Debug: Log the raw record data
                console.log('=== RAW CSV RECORD ===');
                console.log('Record:', JSON.stringify(record, null, 2));
                console.log('Record keys:', Object.keys(record));
                console.log('=== END RAW CSV RECORD ===');
                
                // Extract data using flexible column mapping
                const extractedData = extractDataFromRecord(record, columnMapping);
                
                if (!extractedData.title || !extractedData.cost) {
                    failedLines++;
                    errorMessages.push({
                        line: processedLines + 1,
                        error: "Missing required fields (Title or Cost)"
                    });
                    return;
                }

                // Prepare data for the database model
                const wholesaleData = {
                    wholesale_id: wholesale_id,
                    title: extractedData.title,
                    upc: extractedData.upc || null,
                    item: extractedData.item || null,
                    brand: extractedData.brand || null,
                    size: extractedData.size || null,
                    wholesaleCost: extractedData.cost,
                    packSize: extractedData.packSize || null,
                    qty: extractedData.qty || null,
                    thumbnail: extractedData.thumbnail || null,
                    hyperlink: extractedData.hyperlink || null
                };

                // Debug logging for database save
                console.log('=== DATABASE SAVE DEBUG ===');
                console.log('Wholesale data to save:', JSON.stringify(wholesaleData, null, 2));
                console.log('=== END DATABASE SAVE DEBUG ===');

                // Save the wholesale product data to the database
                await WholesaleProduct.create(wholesaleData);
                processedLines++;

            } catch (error) {
                failedLines++;
                errorMessages.push({ line: processedLines + 1, error: error.message });
                console.error(`Error processing wholesale line ${processedLines + 1}:`, error);
            }
        })
        .on('end', async () => {
            console.log(`Finished parsing wholesale CSV. Processed: ${processedLines}, Failed: ${failedLines}`);

            // Clean up the uploaded file after processing
            fs.unlink(csvFilePath, (unlinkErr) => {
                if (unlinkErr) console.error("Error deleting uploaded file:", unlinkErr);
            });

            if (failedLines > 0) {
                res.status(500).json({
                    message: "Wholesale CSV upload completed with errors.",
                    processed: processedLines,
                    failed: failedLines,
                    errors: errorMessages,
                    redirect: '/list'
                });
            } else {
                console.log(`Wholesale CSV '${req.file.originalname}' uploaded and saved successfully. ID: ${wholesale_id}`);
                // Redirect to wholesale list instead of performing Amazon search
                res.redirect('/wholesale-list');
            }
        })
        .on('error', (err) => {
            console.error("Error during wholesale CSV parsing:", err);
            fs.unlink(csvFilePath, (unlinkErr) => {
                if (unlinkErr) console.error("Error deleting uploaded file on parse error:", unlinkErr);
            });
            res.status(500).json({
                message: "Error processing wholesale CSV file.",
                details: err.message,
                redirect: '/list'
            });
        });
});

// Helper function to extract data from CSV record with flexible column mapping
function extractDataFromRecord(record, columnMapping) {
    const data = {};
    
    // Helper function to find column value
    const findColumn = (possibleNames) => {
        if (!possibleNames) return null;
        const names = Array.isArray(possibleNames) ? possibleNames : [possibleNames];
        for (const name of names) {
            if (name && record[name] !== undefined && record[name] !== null && record[name] !== '') {
                console.log(`Found column "${name}" with value: "${record[name]}"`);
                return record[name];
            }
        }
        console.log(`No matching column found for: ${JSON.stringify(names)}`);
        return null;
    };

    // Extract title
    data.title = findColumn([columnMapping.title, 'Title', 'title', 'Description', 'description', 'Name', 'name', 'Product', 'product']);

    // Extract cost with multiple strategies
    data.cost = extractCost(record, columnMapping);

    // Extract other fields
    data.brand = findColumn([columnMapping.brand, 'Brand', 'brand']);
    data.size = findColumn([columnMapping.size, 'Size', 'size']);
    data.item = findColumn([columnMapping.item, 'Item', 'item', 'ITEM', 'SKU', 'sku']);
    data.thumbnail = findColumn([columnMapping.thumbnail, 'Thumbnail', 'thumbnail', 'Image', 'image', 'img']);
    data.hyperlink = findColumn([columnMapping.hyperlink, 'Hyperlink', 'hyperlink', 'Link', 'link', 'URL', 'url']);
    data.qty = findColumn(['Qty', 'qty', 'Quantity', 'quantity']);
    data.packSize = findColumn(['Pack Size', 'packSize', 'PackSize', 'Pack']);
    data.upc = findColumn(['UPC', 'upc']);

    // Debug logging for thumbnail extraction
    console.log('=== THUMBNAIL EXTRACTION DEBUG ===');
    console.log('Column mapping thumbnail:', columnMapping.thumbnail);
    console.log('Available record keys:', Object.keys(record));
    console.log('Record thumbnail value:', record['thumbnail']);
    console.log('Extracted thumbnail:', data.thumbnail);
    console.log('=== END THUMBNAIL DEBUG ===');

    return data;
}

// Helper function to extract cost from various formats
function extractCost(record, columnMapping) {
    // Strategy 1: Try to find cost from specified cost column
    if (columnMapping.cost) {
        const costValue = record[columnMapping.cost];
        if (costValue) {
            const extracted = extractPriceFromString(costValue);
            if (extracted !== null) return extracted;
        }
    }

    // Strategy 2: Try common cost column names
    const costColumns = ['Cost', 'cost', 'Price', 'price', 'current price'];
    for (const colName of costColumns) {
        if (record[colName]) {
            const extracted = extractPriceFromString(record[colName]);
            if (extracted !== null) return extracted;
        }
    }

    // Strategy 3: Try separate dollar and cents columns
    if (columnMapping.costDollar && columnMapping.costCents) {
        const dollar = record[columnMapping.costDollar];
        const cents = record[columnMapping.costCents];
        if (dollar !== undefined && cents !== undefined) {
            const combined = parseFloat(dollar) + (parseFloat(cents) / 100);
            if (!isNaN(combined)) return combined;
        }
    }

    // Strategy 4: Try common separate dollar/cents patterns
    const dollarColumns = ['cost dollar', 'Cost Dollar', 'dollar'];
    const centsColumns = ['cost cents', 'Cost Cents', 'cents'];
    
    for (const dollarCol of dollarColumns) {
        for (const centsCol of centsColumns) {
            if (record[dollarCol] !== undefined && record[centsCol] !== undefined) {
                const dollar = parseFloat(record[dollarCol]);
                const cents = parseFloat(record[centsCol]);
                if (!isNaN(dollar) && !isNaN(cents)) {
                    return dollar + (cents / 100);
                }
            }
        }
    }

    return null;
}

// Helper function to extract price from string with various formats
function extractPriceFromString(priceString) {
    if (!priceString) return null;
    
    const str = priceString.toString().trim();
    
    // Pattern 1: "current price $4.98"
    const currentPriceMatch = str.match(/current price \$?([\d,]+\.?\d*)/i);
    if (currentPriceMatch) {
        return parseFloat(currentPriceMatch[1].replace(',', ''));
    }
    
    // Pattern 2: "$4.98" or "4.98"
    const priceMatch = str.match(/[\$€£¥]?([\d,]+\.?\d*)/);
    if (priceMatch) {
        return parseFloat(priceMatch[1].replace(',', ''));
    }
    
    // Pattern 3: Just numbers
    const numberMatch = str.match(/([\d,]+\.?\d*)/);
    if (numberMatch) {
        return parseFloat(numberMatch[1].replace(',', ''));
    }
    
    return null;
}

// Route to process the uploaded wholesale data and search Amazon
app.get('/process-wholesale/:wholesale_id', authenticate, async (req, res) => {
    const wholesale_id = req.params.wholesale_id;

    try {
        // 1. Fetch wholesale data from your DB using wholesale_id
        // Assuming you have a model like 'WholesaleProduct'
        const wholesaleProducts = await WholesaleProduct.findAll({
            where: { wholesale_id: wholesale_id },
            // Add attributes if needed
        });

        if (!wholesaleProducts || wholesaleProducts.length === 0) {
            return res.status(404).send('No wholesale products found for this ID.');
        }

        const amazonApiResults = [];

        // 2. Iterate and call the Amazon API for each product
        for (const product of wholesaleProducts) {
            // You'll need to adapt 'insertProductData' or create a new function
            // that uses the 'Description' and 'Item Brand' for the search query.
            // The 'apishopping.js' function 'insertProductData' currently uses 'google_shopping'
            // and 'q', you'll need to adapt it for 'amazon_product' engine and specific parameters.

            const amazonData = await callAmazonProductAPI(
                product.itemBrand, // Or use 'product.description' if brand is not sufficient
                product.description,
                product.wholesale_id // Pass this along to link results
            );

            if (amazonData) {
                // Store amazonData in your database (e.g., a new 'AmazonWholesaleResult' table)
                // You'll need to define this model and its schema.
                // await AmazonWholesaleResult.create({
                //     wholesale_id: product.wholesale_id,
                //     ...amazonData // Spread the relevant fields from amazonData
                // });
                amazonApiResults.push({
                    originalProduct: product,
                    apiResult: amazonData
                });
            }
        }

        // 3. Render a results page or redirect
        res.render('wholesale-results', {
            wholesale_id: wholesale_id,
            results: amazonApiResults
        });

    } catch (error) {
        console.error(`Error processing wholesale data for ID ${wholesale_id}:`, error);
        res.status(500).send('Error processing wholesale data.');
    }
});

// Placeholder function for calling the Amazon API (you'll need to implement this in apishopping.js)
async function callAmazonProductAPI(brand, description, wholesale_id) {
    // This function should:
    // 1. Construct the API call to searchapi.io for amazon_product engine.
    // 2. Use 'brand' and 'description' in the query parameters.
    // 3. Handle the API response.
    // 4. Return relevant data or null if an error occurs.
    console.log(`Calling Amazon API for Brand: ${brand}, Description: ${description}`);

    // --- Implementation details will go in apishopping.js ---
    // You might want to create a new function like:
    // `searchAmazonProduct(brand, description)` in apishopping.js

    // For now, returning a dummy object
    return {
        asin: "EXAMPLE_ASIN",
        title: `Example Product from ${brand}`,
        link: "http://example.com",
        price: "$19.99",
        brand: brand,
        description: description
    };
}


// In index.js, add this route (e.g., before your existing /list route or at the end)

// In index.js, find your existing app.get('/wholesale-list', ...) route
// and replace it with this:

app.get('/wholesale-list', authenticate, async (req, res) => {
    try {
        // Fetch all unique wholesale_id values from the WholesaleProduct table
        // This is similar to how you fetch unique keepa_id values.
        const wholesaleIdsRecords = await WholesaleProduct.findAll({
            attributes: ['wholesale_id', [sequelize.fn('max', sequelize.col('createdAt')), 'max_created']], // Get the latest upload date for each ID
            group: ['wholesale_id'], // Group by wholesale_id to get distinct IDs
            order: [[sequelize.literal('max_created'), 'DESC']] // Order by the latest upload date
        });

        // Extract just the wholesale_id strings
        const wholesaleIds = wholesaleIdsRecords.map(record => record.wholesale_id);

        // Render the wholesale-list view, passing the list of IDs
        res.render('wholesale-list', {
            wholesaleIds: wholesaleIds, // Pass the list of IDs to the view
            page: 'wholesale_list'      // For active nav styling
        });
    } catch (error) {
        console.error('Error fetching wholesale IDs for listing:', error);
        res.status(500).send('Error loading wholesale IDs list.');
    }
});

app.get('/wholesale-products-by-id/:wholesale_id', authenticate, async (req, res) => {
    const startTime = Date.now(); // Start timing
    const wholesale_id = req.params.wholesale_id;
    const page = parseInt(req.query.page, 10) || 1; // For wholesale product pagination
    const ITEMS_PER_PAGE = 10; // How many wholesale items to show on this detail page

    console.log(`--- ENTERING DETAIL ROUTE for wholesale_id: "${wholesale_id}" ---`);

    try {
        // Fetch WHOLESALE PRODUCTS for this batch, with pagination
        const wholesaleProducts = await WholesaleProduct.findAll({
            where: { wholesale_id: wholesale_id },
            order: [['createdAt', 'ASC']],
            limit: ITEMS_PER_PAGE, // Limit how many wholesale items are shown on this page
            offset: (page - 1) * ITEMS_PER_PAGE // Calculate offset for pagination
        });

        if (!wholesaleProducts || wholesaleProducts.length === 0) {
            console.log(`No wholesale products found in DB for ID: "${wholesale_id}"`);
            return res.render('wholesale-products-detail', {
                wholesale_id: wholesale_id,
                message: `No wholesale products found for batch ID "${wholesale_id}".`,
                page: 'wholesale_details'
            });
        }
        console.log(`Found ${wholesaleProducts.length} wholesale products for batch "${wholesale_id}".`);

        // Search for Amazon results for EACH wholesale product in PARALLEL
        console.log(`Starting parallel Amazon searches for ${wholesaleProducts.length} products...`);
        
        const wholesaleProductsWithResults = await Promise.all(
            wholesaleProducts.map(async (wholesaleProduct) => {
                // Construct the search query
                const searchQuery = `${wholesaleProduct.brand ? wholesaleProduct.brand + ' ' : ''}${wholesaleProduct.title}`;
                console.log(`Searching Amazon for product: "${wholesaleProduct.title}"`);
                console.log(`Search query: "${searchQuery}"`);
                
                // Search for this specific product
                const searchResult = await wholesaleModule.searchAmazonProduct(
                    wholesaleProduct.brand, 
                    wholesaleProduct.title
                );
                
                let amazonResults = [];
                if (searchResult && searchResult.length > 0) {
                    console.log(`Found ${searchResult.length} Amazon results for "${wholesaleProduct.title}"`);
                    amazonResults = searchResult;
                } else {
                    console.log(`No Amazon results found for "${wholesaleProduct.title}"`);
                    amazonResults = [{ title: "No Amazon results found for this product.", price: null, rating: null, reviews: null, seller: null, link: null, brand: null, thumbnail: null, recent_sales: null }];
                }
                
                // Return the wholesale product with its Amazon results and search query
                return {
                    wholesaleProduct: wholesaleProduct,
                    amazonResults: amazonResults,
                    searchQuery: searchQuery
                };
            })
        );
        
        console.log(`Processed ${wholesaleProductsWithResults.length} wholesale products with individual Amazon searches.`);

        // Calculate pagination for the wholesale products displayed on THIS page
        const wholesaleProductCount = await WholesaleProduct.count({ where: { wholesale_id: wholesale_id } });
        const totalWholesalePages = Math.ceil(wholesaleProductCount / ITEMS_PER_PAGE);
        const wholesaleStartPage = Math.max(1, page - 2);
        const wholesaleEndPage = Math.min(totalWholesalePages, page + 2);

        // Perform profitability analysis for each wholesale product in PARALLEL
        console.log(`Starting parallel profitability analysis for ${wholesaleProductsWithResults.length} products...`);
        
        const analysisPromises = wholesaleProductsWithResults.map(async (productData, i) => {
            console.log(`\n=== ANALYZING WHOLESALE PRODUCT ${i + 1} ===`);
            console.log('Wholesale Product:', productData.wholesaleProduct.title);
            console.log('Amazon Results Count:', productData.amazonResults.length);
            
            const analysis = await wholesaleModule.analyzeProfitability(productData.wholesaleProduct, productData.amazonResults);
            
            // Replace amazonResults with only profitable results
            if (analysis.profitableResults && analysis.profitableResults.length > 0) {
                productData.amazonResults = analysis.profitableResults;
            } else {
                productData.amazonResults = [];
            }
            
            console.log(`=== END ANALYZING WHOLESALE PRODUCT ${i + 1} ===\n`);
            
            return { index: i, analysis: analysis, productData: productData };
        });
        
        const analysisResultsArray = await Promise.all(analysisPromises);
        
        // Convert back to the expected format
        const analysisResults = {};
        analysisResultsArray.forEach(({ index, analysis, productData }) => {
            analysisResults[index] = analysis;
            wholesaleProductsWithResults[index] = productData;
        });

        // Calculate total page load time
        const endTime = Date.now();
        const totalLoadTime = ((endTime - startTime) / 1000).toFixed(2); // Convert to seconds with 2 decimal places

        res.render('wholesale-products-detail', {
            wholesale_id: wholesale_id,
            wholesaleProductsWithResults: wholesaleProductsWithResults, // Pass the array with products and their individual Amazon results
            analysisResults: analysisResults,      // Pass the profitability analysis results
            
            // Wholesale product pagination data
            wholesaleCurrentPage: page,
            wholesaleTotalPages: totalWholesalePages,
            wholesaleStartPage: wholesaleStartPage,
            wholesaleEndPage: wholesaleEndPage,
            wholesalePageUrl: `/wholesale-products-by-id/${wholesale_id}?page=`,
            
            // Page load time
            totalLoadTime: totalLoadTime,
            
            page: 'wholesale_details'
        });

    } catch (error) {
        console.error(`CRITICAL ERROR fetching details for wholesale_id "${wholesale_id}":`, error);
        res.status(500).send(`Error loading details for wholesale batch "${wholesale_id}".`);
    }
    console.log(`--- EXITING DETAIL ROUTE for wholesale_id: "${wholesale_id}" ---`);
});