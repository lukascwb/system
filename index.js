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

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { analyzeProductSimilarity } = require('./models/geminiAnalysis');



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
        eq: function (a, b) {
            return a === b;
        },
        checkAmazonBB: function (AmazonBB) {
            let percentage = Number(AmazonBB.replace('%', ''));
            return percentage > 50 ? '❎' : '☑️';
        },
        BJs: function (brand) {
            return "https://www.bjs.com/search/" + brand + "/q?template=clp";
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
        const keepaId = req.query.keepa_id;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        // Buscar todos os keepa_ids disponíveis para o dropdown
        const keepaRecords = await KeepaCSV.findAll({
            attributes: ['keepa_id', [sequelize.fn('max', sequelize.col('createdAt')), 'max_created']],
            group: ['keepa_id'],
            order: [[sequelize.literal('max_created'), 'DESC']]
        });

        const keepaIds = keepaRecords.map(record => record.keepa_id);

        // Se não há keepa_id selecionado, apenas mostrar a página de seleção
        if (!keepaId) {
            return res.render('gemini-analyze', { 
                keepaIds: keepaIds,
                keepaProducts: [],
                currentPage: 1,
                totalPages: 0,
                selectedKeepaId: null
            });
        }

        // Query principal para buscar produtos do keepa_id selecionado
        const query = `
            SELECT DISTINCT
                products.keepa_id,
                products.id AS product_id,
                keepacsvs.Title AS keepa_product,
                keepacsvs.\`New: Current\` AS keepa_current,
                products.title AS go_shopp_title,
                products.link AS go_shopp_link,
                products.seller AS go_shopp_seller,
                products.price AS go_shopp_price,
                products.status,
                products.position
            FROM products
            LEFT JOIN apis ON products.api_id = apis.id
            LEFT JOIN keepacsvs ON TRIM(SUBSTRING_INDEX(apis.q, ' near', 1)) = keepacsvs.Title
            WHERE products.keepa_id = ?
            ORDER BY keepacsvs.Title, products.position
        `;

        // Executar a query
        const results = await db.sequelize.query(query, {
            replacements: [keepaId],
            type: db.sequelize.QueryTypes.SELECT
        });

        // Verificar se é uma análise do Gemini (quando há parâmetro analyze=true)
        const shouldAnalyze = req.query.analyze === 'true';
        
        // Agrupar os resultados por keepa_product (ANTES da análise do Gemini)
        const groupedProducts = {};
        results.forEach(row => {
            if (!groupedProducts[row.keepa_product]) {
                groupedProducts[row.keepa_product] = {
                    keepa_product: row.keepa_product,
                    keepa_current: row.keepa_current,
                    products: []
                };
            }
            
            if (row.go_shopp_title) {
                // Verificar se o produto já existe para evitar duplicatas
                const productExists = groupedProducts[row.keepa_product].products.some(
                    product => product.go_shopp_title === row.go_shopp_title && 
                               product.go_shopp_seller === row.go_shopp_seller
                );
                
                if (!productExists) {
                    groupedProducts[row.keepa_product].products.push({
                        product_id: row.product_id,
                        go_shopp_title: row.go_shopp_title,
                        go_shopp_link: row.go_shopp_link,
                        go_shopp_seller: row.go_shopp_seller,
                        go_shopp_price: row.go_shopp_price,
                        status: row.status || null
                    });
                }
            }
        });

        if (shouldAnalyze) {
            console.log('Iniciando análise do Gemini para keepa_id:', keepaId);
            
            // Processar apenas os produtos únicos que aparecem na tela
            for (const keepaProduct of Object.values(groupedProducts)) {
                for (const product of keepaProduct.products) {
                    if (product.go_shopp_title && keepaProduct.keepa_product) {
                        try {
                            // Analisar similaridade com o Gemini
                            console.log(`Analisando produto ${product.product_id}:`);
                            console.log(`  Keepa: "${keepaProduct.keepa_product}"`);
                            console.log(`  Shopping: "${product.go_shopp_title}"`);
                            
                            const status = await analyzeProductSimilarity(keepaProduct.keepa_product, product.go_shopp_title);
                            
                            // Atualizar o status no banco de dados
                            await apishopping.Products.update(
                                { status: status },
                                { where: { id: product.product_id } }
                            );
                            
                            // Atualizar o status no objeto local também
                            product.status = status;
                            
                            console.log(`  Resultado: ${status}`);
                            
                            // Aguardar um pouco para não sobrecarregar a API
                            await new Promise(resolve => setTimeout(resolve, 100));
                            
                        } catch (error) {
                            console.error('Erro ao analisar produto:', error);
                            
                            // Se for erro específico do Gemini, marcar como erro
                            if (error.message.includes('Resposta inesperada do Gemini') || error.message.includes('Gemini API request failed')) {
                                await apishopping.Products.update(
                                    { status: 'erro_gemini' },
                                    { where: { id: product.product_id } }
                                );
                                product.status = 'erro_gemini';
                                console.error(`Erro específico do Gemini para produto ${product.product_id}:`, error.message);
                            } else {
                                // Para outros erros, marcar como reprovado
                                await apishopping.Products.update(
                                    { status: 'reprovado' },
                                    { where: { id: product.product_id } }
                                );
                                product.status = 'reprovado';
                            }
                        }
                    }
                }
            }
            
            // Recarregar os dados após a análise
            const updatedResults = await db.sequelize.query(query, {
                replacements: [keepaId],
                type: db.sequelize.QueryTypes.SELECT
            });
            results.length = 0;
            results.push(...updatedResults);
        }

        // Usar o groupedProducts já criado anteriormente (sem redeclarar)

        // Converter para array e aplicar paginação
        const allKeepaProducts = Object.values(groupedProducts);
        const totalKeepaProducts = allKeepaProducts.length;
        const totalPages = Math.ceil(totalKeepaProducts / limit);
        
        const keepaProducts = allKeepaProducts.slice(offset, offset + limit);

        res.render('gemini-analyze', {
            keepaIds: keepaIds,
            keepaProducts: keepaProducts,
            currentPage: page,
            totalPages: totalPages,
            selectedKeepaId: keepaId,
            hasPrevPage: page > 1,
            hasNextPage: page < totalPages
        });

    } catch (error) {
        console.error('Error during Gemini analysis:', error);
        res.status(500).send('Error during Gemini analysis: ' + error.message);
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
            // console.log('index - groupedProducts: ' + JSON.stringify(groupedProducts, null, 2));
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

