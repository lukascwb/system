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
const { Console } = require('console');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const sequelize = require('sequelize');
const { stringify } = require('querystring');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const session = require('express-session');
const bcryptjs = require('bcryptjs');
const passport = require('passport');
const router = express.Router();
const flash = require('express-flash');


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

app.use(flash());
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
            let newCurrent = Number(data['New: Current'].replace('$', ''));
            let new30DaysAvg = Number(data['New: 30 days avg.'].replace('$', ''));
            let new180DaysAvg = Number(data['New: 180 days avg.'].replace('$', ''));
            data['New: Average'] = ((newCurrent + new30DaysAvg + new180DaysAvg) / 3).toFixed(2);

            let buyBoxCurrent = Number(data['Buy Box: Current'].replace('$', ''));
            let buyBox90DaysAvg = Number(data['Buy Box: 90 days avg.'].replace('$', ''));
            data['Buy Box: Average'] = ((buyBoxCurrent + buyBox90DaysAvg) / 2).toFixed(2);

            data['New: Price Sellable'] = Number((data['New: Average'] * 0.4).toFixed(2));
            data['Buy Box: Price Sellable'] = Number((data['Buy Box: Average'] * 0.4).toFixed(2));


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
                // const api = process.env.GOOGLE_API_KEY;
                // const genAI = new GoogleGenerativeAI(api);

                // const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                // const prompt = "1+1"

                // const result = await model.generateContent(prompt);
                // const response = await result.response;
                // const text = response.text();
                // console.log("GEMINI: " + text);

                productsAPI.forEach((apiRecord, productIndex) => {
                    //if (productsAPI[keepaIndex].title != 'No Results') {
                    if (productsAPI[keepaIndex] !== undefined && productsAPI[keepaIndex].title !== undefined && productsAPI[keepaIndex].title.trim() !== '') {
                        let check = 0;
                        const apiWeigth = apishopping.getWeight(apiRecord.title);
                        let originalTitle = apiRecord.title;
                        apiRecord.title = " " + apiRecord.title;
                        let storePrice = parseFloat(apiRecord.price.replace('$', '')) * unitKeepa * 2;
                        console.log('storePrice ' + storePrice + ' avg ' + avgKeepaPrice + ' w' + weightKeepa + ' t' + apiRecord.title)
                        //check Prices
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

        return res.status(401).send('Error to create.');
        /*
      const { username, password } = req.body;
  
      // Hash the password:
      const hashedPassword = await bcryptjs.hash(password, 10); // 10 is the salt rounds (adjust if needed)
        

      const user = await User.create({
        username: username,
        password: hashedPassword // Store the hashed password 
      }); 
  
      // ... redirect or send a success response ...
      res.redirect('/login');*/

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
   // res.render('keepa');
   res.render('keepa', { error: req.flash('error')[0] });
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
                console.error("CSV parsing error:", err);
                res.status(500).json({
                    message: "Error parsing CSV file.",
                    details: err.message,
                    redirect: '/list' // Add redirect suggestion
                });
                return;
            }

            if (records) {
                for (const record of records) {
                    try {
                        record.Image = Object.values(record).toString().split('.jpg')[0] + '.jpg';
                        record.keepa_id = keepa_id;
                        await KeepaCSV.create(record);
                        processedLines++;
                    } catch (error) {
                        failedLines++;
                        errorMessages.push({ line: processedLines + 1, error: error.message });
                        console.error(`Error processing line ${processedLines + 1}:`, error);
                    }
                }
            }

            // if (failedLines > 0) {
            //     // If there were errors, send the error information
            //     res.status(200).json({
            //         message: "CSV upload complete with errors.",
            //         processed: processedLines,
            //         failed: failedLines,
            //         errors: errorMessages,
            //         link: '/list', // Send just the URL, not the full HTML
            //         link: 'http://localhost:8081/list'
            //     });
            // } else {
            //     // If no errors, redirect to '/list'
            //     res.redirect('/list');
            // }

            res.redirect('/list');
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



app.listen(8081, authenticate, function () {
    console.log('Servidor Rodando');
});

