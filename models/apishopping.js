//import fetch from 'node-fetch';
const axios = require("axios");
//import fetch from 'async';
const async = require('async');
const db = require('./database');
const { FOREIGNKEYS } = require("sequelize/lib/query-types");

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

async function insertProductData(lineKeepa) {

    try {
        console.log('calling insertProductData');
        const url = "https://www.searchapi.io/api/v1/search";
        const params = {
            "engine": "google_shopping",
            "q": `${lineKeepa.Title} near 02721 nearby walmart, target, bjs, Stop & Shop`,
            "location": "Raynham,Massachusetts,United States",//"Tauton,Massachusetts,United States",
            "api_key": process.env.api_key,
            "tbs": "mr:1,local_avail:1,ss:30"
        };

        const response = await axios.get(url, { params });
        if (response.data && response.data.shopping_results && Array.isArray(response.data.shopping_results)) {

            let dataGoogleShoppingAPI = {
                keepa_id: lineKeepa.keepa_id,
                status: response.data.search_metadata.status || null,
                total_time_taken: response.data.search_metadata.total_time_taken || null,
                html_url: response.data.search_metadata.html_url || null,
                json_url: response.data.search_metadata.json_url || null,
                q: response.data.search_parameters.q || null,
                request_url: response.data.search_parameters.request_url || null
            };

            const newApi = await Api.create(dataGoogleShoppingAPI);
            var length = response.data.shopping_results.length ? response.data.shopping_results.length > 14 ? 14 : response.data.shopping_results.length : 0;

            const productsToCreate = response.data.shopping_results.slice(0, 14).map((result, i) => ({
                api_id: newApi.id,
                keepa_id: lineKeepa.keepa_id,
                position: result.position || null,
                title: result.title || null,
                seller: result.seller || null,
                link: result.product_link || null,
                price: result.price || null,
                delivery: result.delivery || null,
                thumbnail: result.thumbnail || null,
                order_fullfillmed_method: result.order_fullfillmed_method || null
            }));
            await Products.bulkCreate(productsToCreate);
            lineKeepa.html_url = response.data.search_metadata.html_url;
            return await newApi;
        } else {
            console.log('No shopping results found for:', lineKeepa.Title);
            return null; // Or handle this case differently
        }
    } catch (error) {
        console.error('Error fetching and inserting data:', error);
        throw error; // Re-throw for error handling in the calling function
    }
}


////////////////////////OLD FUNCTION NOT BEEN USED
async function getProductData(tblKeepa) {
    try {
        //console.log(tblKeepa.titleKeepa[0]);
        let limitedData = [];


        /* CODE THAT IS WORKING
         for (let i = 0; i < tblKeepa.length; i++) {
             //API Working
             let url = 'https://www.searchapi.io/api/v1/search?api_key=NSaKQST1EL6PLXbfN6t3fJ6f&engine=google_shopping&q=' + tblKeepa[i].Title + '&location=Fall%20River%2CMassachusetts%2CUnited+States&tbs=mr:1,local_avail:1,ss:30';
             // Wait for the response:
             const response = await axios.get(url);
             // Now you can process and return the data:
             limitedData.push(response.data.shopping_results.slice(0, 5));
             //console.log(`Index ${i} -`, response.data.shopping_results.slice(0, 2));

         }
 */

        //receive array
        const keepaTitles = tblKeepa.map(record => record.Title) + " nearby";
        ///PROMISSE ALL ------trying
        try {
            // Create an array of promises for each API request:

            const promises = keepaTitles.map(title => {
                //let url = `https://www.searchapi.io/api/v1/search?api_key=process.env.api_key&engine=google_shopping&q=${title}&location=Fall%20River%2CMassachusetts%2CUnited+States`
                //let filter = `&tbs=mr:1,local_avail:1,ss:30`;
                //let filter = `&tbs=mr:1,merchagg:g8299768%7Cg784994%7Cg128518585%7Cg8666297%7Cg138144780%7Cm8175035%7Cm125198988%7Cm125198037%7Cm5336668818%7Cm263254853%7Cm10046%7Cm366131026%7Cm178357739%7Cm178347382%7Cm178357103%7Cm260435655%7Cm118138822%7Cm10037%7Cm324480287%7Cm1062500&sa=X&ved=0ahUKEwib7Jieg7uGAxXuFFkFHftADK4QsysIogsoSw&biw=1718&bih=1304&dpr=1`;
                const url = "https://www.searchapi.io/api/v1/search";
                const params = {
                    "engine": "google_shopping",
                    "q": `${title} near 02721`,
                    "location": "Raynham,Massachusetts,United States",//"Tauton,Massachusetts,United States",
                    "api_key": process.env.api_key,
                    "tbs": "mr:1,local_avail:1,ss:30",
                    "gl": "us",
                };
                //return axios.get(url);
                return axios.get(url, { params });
            });

            const responses = await Promise.all(promises);

            responses.forEach((response, index) => {
                //add to db - googleshopping
                tblKeepa[0].keepa_id

                //in case when there is no shopping_results
                if (!Array.isArray(response.data.shopping_results)) {
                    limitedData.push({
                        title: 'No Results',
                    });
                    tblKeepa[index].html_url = response.data.search_metadata.html_url;
                    return;
                }

                //const length = response.data.shopping_results.length ? response.data.shopping_results.length > 7 ? 7 : response.data.shopping_results.length : 0;
                
                for (let i = 0; i < length; i++) {
                    if (i == 0) {
                        let dataGoogleShoppingAPI = {
                            keepa_id: tblKeepa[index].keepa_id, // Replace with actual value
                            status: response.data.search_metadata.status || null,
                            total_time_taken: response.data.search_metadata.total_time_taken ? response.data.search_metadata.total_time_taken : null,
                            //request_url: response.data.search_metadata.request_url || null,
                            html_url: response.data.search_metadata.html_url || null,
                            json_url: response.data.search_metadata.json_url || null,
                            q: response.data.search_parameters.q || null,
                        };
                        //console.log('GoogleShoppingAPI: ' + dataGoogleShoppingAPI);
                        GoogleShoppingAPI.create(dataGoogleShoppingAPI);
                        // InsertData(GoogleShoppingAPI);
                    }

                    let dataGoogleShoppingProducts = {
                        keepa_id: tblKeepa[index].keepa_id, // Replace with actual value
                        position: response.data.shopping_results[i].position || null,
                        //product_id: response.data.shopping_results[i].product_id || null,
                        title: response.data.shopping_results[i].title || null,
                        seller: response.data.shopping_results[i].seller || null,
                        link: response.data.shopping_results[i].offers_link || null,
                        price: response.data.shopping_results[i].price || null,
                        delivery: response.data.shopping_results[i].delivery || null,
                        thumbnail: response.data.shopping_results[i].thumbnail || null,
                    };
                    Products.create(dataGoogleShoppingProducts);
                    // console.log('GoogleShoppingProducts: '  + dataGoogleShoppingProducts);
                    //InsertData(GoogleShoppingProducts);

                    //db.insertGoogleShoppingProducts.create(data);
                }

                if (length >= 7)
                    limitedData.push(response.data.shopping_results.slice(0, 7));
                else limitedData.push(response.data.shopping_results.slice(0, length));

                //add html_url on tblKeepa
                tblKeepa[index].html_url = response.data.search_metadata.html_url;
            });

        } catch (error) {
            console.error('Error fetching data:', error);
        }
        ///PROMISSE ALL ------ends here
        return limitedData;

    } catch (error) {
        console.error('Error fetching data:', error.message);
        throw error;
    }
}


// async function handleProductsAPI(tblKeepa, productsAPI) {
//    // console.log('handleProductsAPI - length: ' + tblKeepa.length);
//     tblKeepa.map((keepaRecord, keepaIndex) => { // Use keepaIndex correctly
//         productsAPI.map((productRecord, productIndex) => {
//             console.log('productRecord[productIndex].title ' + productRecord.title);
//             let emojiX = true;
//             const avgKeepaPrice = avgPriceKeepa(keepaRecord)
//             const weightKeepa = getWeight(keepaRecord.Title);
//             const unitKeepa = getUnitCount(keepaRecord.Title);
//             if (productRecord[productIndex].title != 'No Results') {
//                 let check = 0;
//                 const apiWeigth = getWeight(productsAPI[keepaIndex].title);
//                 let originalTitle = productsAPI[productIndex].title;
//                 productsAPI[productIndex].title = " " + productsAPI[productIndex].title;
//                 let ourPrice = parseFloat(productsAPI[productIndex].price.replace('$', '')) * unitKeepa * 2;
//                 //check Prices
//                 if (ourPrice < avgKeepaPrice) {
//                     productsAPI[productIndex].title = "💵" + productsAPI[productIndex].title;
//                     check += 1;
//                 }

//                 if (weightKeepa * 0.75 < apiWeigth && weightKeepa * 1.25 > apiWeigth) {
//                     productsAPI[productIndex].title = "⚖️" + productsAPI[productIndex].title;
//                     check += 1;
//                 }
//                 //It`s a good product ✅
//                 if (check === 2)
//                     productsAPI[productIndex].title = "✅ " + originalTitle;

//                 if ((weightKeepa != null && avgKeepaPrice > 0) && check === 0)
//                     productsAPI[productIndex].title = "❌" + productsAPI[productIndex].title // Has the information and don't match
//                 else if (weightKeepa === null || avgKeepaPrice === 0)// IF Doesn't has the information
//                     if (emojiX) {//We can't check(don't have all info)"⚠️"
//                         tblKeepa[keepaIndex].Title = "⚠️" + tblKeepa[keepaIndex].Title;//apiRecord.title = "⚠️" + apiRecord.title
//                         emojiX = false;
//                     }
//             }
//         });
//     });
//     //console.log('apishopping - 178 - length: ' + productsAPI.length);
//     return { tblKeepa, productsAPI };
// }

function getUnitCount(title) {
    // Regex with improved pattern matching:
    const regex = /\b(?:\(Pack of (\d+)\)|(?:(\d+)-pack|\/(\d+)\s*(?:[bB]x|[cC]t|[cC]ount|[uU]nits)?|Case(\d+)|of (\d+)|(\d+)\s*(?:count|ct|units|pk|pcs|Bx)))\b/gi;

    let match;
    while ((match = regex.exec(title)) !== null) {
        for (let i = 1; i < match.length; i++) {
            if (match[i]) {
                return parseInt(match[i], 10);
            }
        }
    }

    return 1; // Default to 1 if no unit count is found
}

function getWeight(title) {
    // Regex to match patterns like "10 oz", "1.5-ounce", "2.53 Pounds", "2.53 lbs", "2.53 kilograms"
    const regex = /\b(\d+(?:\.\d+)?)\s*(oz|g|lb|lbs|kg|pounds|kilograms|ounce|ounces)\b/gi;

    let match;
    while ((match = regex.exec(title)) !== null) {
        const weight = parseFloat(match[1]);
        const unit = match[2].toLowerCase();

        // Standardize to ounces:
        if (unit === 'g') {
            return weight * 0.035274; // Convert grams to ounces
        } else if (unit === 'lb' || unit === 'lbs' || unit === 'pounds') {
            return weight * 16; // Convert pounds to ounces 
        } else if (unit === 'kg' || unit === 'kilograms') {
            return weight * 35.274; // Convert kilograms to ounces
        } else {
            return weight; // Assume ounces if unit is 'oz', 'ounce', or 'ounces'
        }
    }

    return null; // Return null if no weight is found
}

function avgPriceKeepa(keepaRecord) {
    const data = keepaRecord;
    let sumKeepaPrice = 0;
    let priceCount = 0;

    // Check each price, add to sum if not null, empty, or '-'
    if (data['Buy Box: Current'] && data['Buy Box: Current'] !== '' && data['Buy Box: Current'] !== '-') {
        const price = cleanAndParsePrice(data['Buy Box: Current']);
        if (price > 0) {
            sumKeepaPrice += price;
            priceCount++;
        }
    }
    if (data['Buy Box: 90 days avg.'] && data['Buy Box: 90 days avg.'] !== '' && data['Buy Box: 90 days avg.'] !== '-') {
        const price = cleanAndParsePrice(data['Buy Box: 90 days avg.']);
        if (price > 0) {
            sumKeepaPrice += price;
            priceCount++;
        }
    }

    if (priceCount == 0) {
        // Check each price, add to sum if not null, empty, or '-'
        if (data['New: Current'] && data['New: Current'] !== '' && data['New: Current'] !== '-') {
            const price = cleanAndParsePrice(data['New: Current']);
            if (price > 0) {
                sumKeepaPrice += price;
                priceCount++;
            }
        }
        if (data['New: 30 days avg.'] && data['New: 30 days avg.'] !== '' && data['New: 30 days avg.'] !== '-') {
            const price = cleanAndParsePrice(data['New: 30 days avg.']);
            if (price > 0) {
                sumKeepaPrice += price;
                priceCount++;
            }
        }
        if (data['New: 180 days avg.'] && data['New: 180 days avg.'] !== '' && data['New: 180 days avg.'] !== '-') {
            const price = cleanAndParsePrice(data['New: 180 days avg.']);
            if (price > 0) {
                sumKeepaPrice += price;
                priceCount++;
            }
        }
    }

    // Calculate average only if there are valid prices to average
    if (priceCount > 0) {
        return (sumKeepaPrice / priceCount).toFixed(2);
    } else {
        return 'N/A'; // Return N/A if no valid prices found
    }
}


const Api = db.sequelize.define('Api', {

    keepa_id: {
        type: db.Sequelize.STRING,
        FOREIGNKEYS: true
    },
    status: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    total_time_taken: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    request_url: {
        type: db.Sequelize.STRING(4000),
        allowNull: true
    },
    html_url: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    json_url: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    q: {
        type: db.Sequelize.STRING,
        allowNull: true
    }

});

// Sync model
(async () => {
    try {
        await db.sequelize.authenticate();
        console.log('Connection has been established successfully.');
        await Api.sync();
        //await Api.sync({ force: true }); // force
        console.log('Api table synchronized.');
    } catch (err) {
        console.error('Unable to connect to the database:', err);
    }
})();



const Products = db.sequelize.define('Products', {
    api_id: {
        type: db.Sequelize.INTEGER,
        allowNull: false,
    },
    keepa_id: {
        type: db.Sequelize.STRING,
        allowNull: false
    },
    product_id: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    position: {
        type: db.Sequelize.INTEGER,
        allowNull: true
    },
    title: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    seller: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    link: {
        type: db.Sequelize.STRING(4000),
        allowNull: true
    },
    price: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    order_fullfillmed_method: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    delivery: {
        type: db.Sequelize.STRING,
        allowNull: true
    },
    thumbnail: {
        type: db.Sequelize.STRING,
        allowNull: true
    }
});

// Sync model
(async () => {
    try {
        await db.sequelize.authenticate();
        console.log('Connection has been established successfully.');
        await Products.sync();
        //await Products.sync({ force: true }); // force
        console.log('Products table synchronized.');
    } catch (err) {
        console.error('Unable to connect to the database:', err);
    }
})();




module.exports = {
    getProductData,
    Products,
    Api,
    insertProductData,
    avgPriceKeepa,
    getWeight,
    getUnitCount
};


/*
app.get("/api", function (req, res) {

    let url = 'https://www.searchapi.io/api/v1/search?api_key=process.env.api_key&engine=google_shopping&q=PS5&location=Fall%20River%2CMassachusetts%2CUnited+States&tbs=mr:1,local_avail:1,ss:30';
    /*const params = {
        "engine": "google_shopping",
        "q": "PS5",
        "location": "Massachusetts, United States",
        "api_key": process.env.api_key
    };

    axios.get(url)
        .then(response => {

            var dataSliced = response.data.shopping_results.slice(0,1 );
            ///console.log(dataSliced);
            /*
            for (let i = 0; i < 2; i++) {
                var title = response.data.shopping_results[i].title
                var price = response.data.shopping_results[i].price
                //var img = response.data.shopping_results[i].thumbnail
                data += [title, price];
            }
            //console.log(data);

            res.render('apishopping', { data: dataSliced });


        })
        .catch(error => {
            console.log('Error:', error.message);
        });

})*/


/*
                //example to be faster
                var tbl = [];
        
                tbl = await [
                    {
                        title: "Special K Cold Breakfast Cereal, High Protein, Fiber Cereal, Chocolate Almond, 15 ...",
                        seller: "Walmart",
                        price: "$7.98",
                        thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcTf9JuOyBij8DTEgqteanJ7342-WBLzj1xsMBE04_i6a0qgC2V4xHR6vNNIQE7MVtsOi8XbBvaSM4hSBFdInd34TA_YaRBjxtLKIMfupyN2j2uiZRFQmBTE&usqp=CAE"
                    },
                    {
                        title: "Special K Chocolately Delight Breakfast Cereal, Family Size - 18.5oz - Kellogg's",
                        seller: "Walmart",
                        price: "$4.98",
                        thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcR1WHtUIx8Zi-uQUEukdgA3jlzA0x0oiOv4QbsbexCC9gXLORrfEAm32lKl022iIW5W1LJTjeyclT2pWAzNUo86hlj2SO5MpYwh4NtmmXwOkAPp3l1V2Yu3mQ&usqp=CAE"
                    },
                    {
                        title: "Special K Cereal, Original, Family Size - 18 oz",
                        seller: "Target",
                        price: "$5.29",
                        thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQktrIqsetHdwaNLSfdKYzlE2L6cpl8eMVPERAsw6jOtUrIp15e2BwMScNowcg67ZSCoqSSZBueWzEoTomHfVKDnYLEGscvFl9_oEPF1s03jdZSH0h2xX0fYg&usqp=CAE"
                    },
                    {
                        title: "Special K Cereal, Chocolatey Delight - 13.2 oz",
                        seller: "CVS Pharmacy",
                        price: "$6.79",
                        thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcT4_ydhlRGBRqWdG1F_eWQrfEBUyly7IB2ukdrMX0tuYYSDlmy41UCIaIVrSbOfUYRQHTh5hOaVHP_5Ohw310kc2he9y4iLFMC_J0kOxzWKd0MDxxICBD48sA&usqp=CAE"
        
                    },
                    {
                        title: "Special K Fruit and Yogurt Breakfast Cereal - 19.1oz - Kellogg's",
                        seller: "Walmart",
                        price: "$4.98",
                        thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcTp7P9fUNA0Zc4BRsTreUbdvlkMaXesmnJI6HfFrO-ETpQodtgmVhaK50DmnWANSLS9VOPRaRRkvmpfmL1DFyRbFtlOrAwMHqCyu85GYDE9t8DdazqsYHZU0Q&usqp=CAE"
        
                    }
                ];
                limitedData.push(tbl);
        
                tbl = await [
                    {
                        title: 'Rice Krispies Cold Breakfast Cereal, Kids Snacks, Baking Marshmallow Treats ...',
                        price: '$6.28',
                        seller: 'Walmart',
                        thumbnail: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcQmjJg2B_0NwIejmRYYBWGFaHTbkbkP34uajGYqXYXxJPbQK7dfKxIyRP37a0rU7cYWyrUCxUv7ZgfXVYa6DyOTDVis8ltTkaUkWEupnKDK&usqp=CAE'
                    },
                    {
                        title: "Rice Krispies Treats Crispy Marshmallow Squares, Original, Homestyle - 12 pack, 1 ...",
                        seller: "Walmart",
                        price: "$6.12",
                        thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcShvg2D97PuIih9OiSTwzfki5RAs0IEcbd69YEtcnkh9wEIHKur5WO6LD584YFaj0kc2Ioqp38fQnP5PpOLZC4owLL9Y8SV3WbG7Lfm57aW&usqp=CAE"
                    },
                    {
                        title: "Frosted Krispies Cold Breakfast Cereal, Kids Snacks, Baking Marshmallow Treats ...",
                        seller: "Walmart",
                        price: "$4.98",
                        thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQ10TjIxj6st861kTSmJujlQ8Z8CH4pfKPvXNeWc-M_JsxS8BWJuXx-AGePgxzEFQNxwXmXa_MZrh0vrEwkLKB0YIgUEmUC9n4DZ6OXEBqB-78HzmF_CcWfgQ&usqp=CAE"
                    },
                    {
                        title: "Rice Krispies Treats Crispy Marshmallow Squares, The Original, Original Size - 40 ...",
                        seller: "Target",
                        price: "$11.99",
                        thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQvMC7CvKG4DNrJ6Yy4T8l9dkcQXIYD670U2HcEJOvwMtgVaBR3s2fy7NLaiAzu6QTyl8DT7ZhVlWbJ0kvc_e4CS_TZmLhFLcWfHJql_O5i&usqp=CAE"
        
                    },
                    {
                        title: "Rice Krispies Rice Cereal, Toasted - 9 oz",
                        seller: "CVS Pharmacy",
                        price: "$3.49",
                        thumbnail: "https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcTXdAlbhVegrCVMcW0WiI9r5OZAvQB7XH1ZFlJnIG1Ywznog2DXNo2vc1p4T89oJUrA1T_CdGxjW_0bJBTo6ME948OUrS-4gCqVra3d0YtnCigkKa0p7zAF2A&usqp=CAE"
        
                    }
                
                ];
                limitedData.push(tbl);
        */