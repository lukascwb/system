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
        
        // Use raw Keepa title for search
        console.log('Raw Keepa Title:', lineKeepa.Title);
        
        // Calculate price range with fallback for missing data
        const priceRange = calculatePriceRange(lineKeepa);
        
        // Improve Keepa title for better API search results
        const improvedTitle = improveKeepaTitleForSearch(lineKeepa.Title);
        console.log('Original Keepa Title:', lineKeepa.Title);
        console.log('Improved Title for API:', improvedTitle);
        
        // Use improved title for search
        const searchVariations = [improvedTitle];
        
        // Try multiple search variations to get better results
        let response = null;
        let bestResponse = null;
        
        // Try multiple locations for better coverage
        const locations = [
            "Raynham,Massachusetts,United States"
        ];
        
        for (const searchQuery of searchVariations) {
            for (const location of locations) {
                try {
                    // Create base search query with seller hints for better targeting
                    let enhancedQuery = searchQuery;
                    if (priceRange.hasPriceData) {
                        // Add all approved sellers to improve results from approved retailers
                        /*const approvedSellers = [ 'Nearby',
                            '02721'
                        ];*/
                        const approvedSellers = [ 'Nearby', '02721',
                           /* 'Ace Hardware', 'Best Buy', 'BJ\'s', 'CVS', 'Dick\'s Sporting Goods', 
                            'Dollar General', 'Dollar Tree', 'Family Dollar', 'GameStop', 'Five Below', 
                            'The Home Depot', 'Kohl\'s', 'Lowe\'s', 'Macy\'s', 'Michael\'s', 'PetSmart', 
                            'Rite Aid', 'Rhode Island Novelty', 'Sam\'s Club', 'Shaw\'s', 'Staples', 'Stop & Shop', 
                            'Target', 'VitaCost', 'Walmart', 'Walgreens', 'WebstaurantStore.com'*/
                        ];
                        const sellerHints = approvedSellers.join(' ');
                        enhancedQuery = `${searchQuery} ${sellerHints}`;
                    }
                    
                    const params = {
                        "engine": "google_shopping",
                        "q": enhancedQuery,
                        "location": location,
                        "api_key": process.env.api_key,
                        "gl": "us",
                        "hl": "en",
                    };
                    
                    // Only add price filters if we have valid price data
                    /*if (priceRange.hasPriceData) {
                        params.price_min = priceRange.minPrice;
                        params.price_max = priceRange.maxPrice;
                        console.log(`Applied price filters: min=${priceRange.minPrice}, max=${priceRange.maxPrice} for Keepa price $${priceRange.keepaPrice}`);
                    } else {
                        console.log(`No price data available for: ${lineKeepa.Title}, using default search`);
                    }*/
                    
                    response = await axios.get(url, { params });
                    
                    // Check if we got good results (products from approved sellers)
                    if (response.data && response.data.shopping_results && Array.isArray(response.data.shopping_results)) {
                        const approvedResults = response.data.shopping_results.filter(result => 
                            isApprovedSeller(result.seller)
                        );
                        
                        // If we found approved sellers, use this response
                        if (approvedResults.length > 0) {
                            bestResponse = response;
                            console.log(`Found ${approvedResults.length} approved sellers for: ${lineKeepa.Title} at location: ${location}`);
                            break;
                        }
                    }
                    
                    // If no approved sellers found, keep trying other search variations
                    if (!bestResponse) {
                        bestResponse = response;
                    }
                    
                } catch (error) {
                    console.log(`Search variation failed for "${searchQuery}" at location "${location}":`, error.message);
                    continue;
                }
            }
            // If we found a good response, break out of the search variations loop too
            if (bestResponse && bestResponse.data && bestResponse.data.shopping_results && 
                bestResponse.data.shopping_results.filter(result => isApprovedSeller(result.seller)).length > 0) {
                break;
            }
        }
        
        // Use the best response we found
        response = bestResponse;
        
        // Analyze the API response for approved sellers
        if (response.data) {
            analyzeApiResponseForApprovedSellers(response.data);
        }
        
        if (response.data && response.data.shopping_results && Array.isArray(response.data.shopping_results)) {

                    let dataGoogleShoppingAPI = {
            keepa_id: lineKeepa.keepa_id,
            status: response.data.search_metadata.status || null,
            total_time_taken: response.data.search_metadata.total_time_taken || null,
            html_url: response.data.search_metadata.html_url || null,
            json_url: response.data.search_metadata.json_url || null,
            q: (response.data.search_parameters.q || '').substring(0, 255),
            request_url: response.data.search_parameters.request_url || null
        };

            const newApi = await Api.create(dataGoogleShoppingAPI);
            
            // Filter results to only include approved sellers with matching brands
            const keepaBrand = identifyBrandFromTitle(lineKeepa.Title);
            const keepaBrandColumn = lineKeepa.Brand; // Get brand from Keepa Brand column
            console.log('Keepa Brand (from title):', keepaBrand);
            console.log('Keepa Brand (from column):', keepaBrandColumn);
            
            const filteredResults = response.data.shopping_results.filter(result => {
                const sellerApproved = isApprovedSeller(result.seller);
                const resultBrand = identifyBrandFromTitle(result.title);
                
                // Check if brands match (either from title analysis or from Keepa Brand column)
                const brandMatches = (keepaBrand && resultBrand && keepaBrand.toLowerCase() === resultBrand.toLowerCase()) ||
                                   (keepaBrandColumn && resultBrand && keepaBrandColumn.toLowerCase() === resultBrand.toLowerCase());
                
                console.log(`Filtering result: "${result.title}"`);
                console.log(`  - Seller: ${result.seller} (Approved: ${sellerApproved})`);
                console.log(`  - Result Brand: ${resultBrand}`);
                console.log(`  - Brand Match: ${brandMatches}`);
                console.log(`  - Keep: ${sellerApproved && brandMatches}`);
                
                // Only keep products from approved sellers with matching brands
                return sellerApproved && brandMatches;
            });
            
            console.log(`Filtered ${response.data.shopping_results.length} results down to ${filteredResults.length} approved sellers with matching brands`);
            
            var length = filteredResults.length ? filteredResults.length > 40 ? 40 : filteredResults.length : 0;

            const productsToCreate = filteredResults.slice(0, length).map((result, i) => ({
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
    // Regex to match patterns like "10 oz", "1.5-ounce", "2.53 Pounds", "2.53 lbs", "2.53 kilograms", "209grams"
    const regex = /\b(\d+(?:\.\d+)?)\s*(oz|g|lb|lbs|kg|pounds|kilograms|ounce|ounces|grams?)\b/gi;

    let match;
    while ((match = regex.exec(title)) !== null) {
        const weight = parseFloat(match[1]);
        const unit = match[2].toLowerCase();

        // Standardize to ounces:
        if (unit === 'g' || unit === 'gram' || unit === 'grams') {
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


// Function to improve Keepa title for better API search results
function improveKeepaTitleForSearch(keepaTitle) {
    if (!keepaTitle) return keepaTitle;
    
    let improvedTitle = keepaTitle;
    
    // 1. Remove ONLY specific packaging information (multi-pack details)
    const packPatterns = [
        /\s*\(Pack\s+of\s+\d+\)/gi,           // (Pack of 20)
        /\s*\(Pack\s+Of\s+\d+\)/gi,           // (Pack Of 20)
        /\s*\(\d+\s+Value\s+Size\s+Bags?\)/gi, // (3 Value Size Bags)
        /\s*\(\d+\s+Pack\)/gi,                // (10 Pack)
        /\s*\(\d+\s+Packs?,\s*\d+\.\d+\s*oz\)/gi, // (20 Packs, 0.67 oz)
        /\s*\(\d+\s+Pack\s+x\s+\d+\s*oz\s*\(Total\s+\d+oz\)\)/gi, // (4-Pack x 7 oz (Total 28oz))
        /\s*\(\d+\s+Pack\s+x\s+\d+\s*oz\)/gi, // (4-Pack x 7 oz)
        /\s*\(\d+\s+Count\)/gi,               // (20 Count)
        /\s*\(\d+\s+ct\)/gi,                  // (20 ct)
        /\s*\(\d+\s+twin\s+packs\)/gi,        // (2 twin packs)
        /\s*\(\d+\s+Biscuits?\s+Per\s+Pack\)/gi, // (2 Biscuits Per Pack)
        /\s*-\s*\d+\s*Pack/gi,                // - 10 Pack
        /\s*-\s*Bulk\s+Pack\s+of\s+\d+/gi,    // - Bulk Pack of 20
        /\s*-\s*Pack\s+Of\s+\d+/gi,           // - Pack Of 20
        /\s*\(\d+\s+Individually\s+Wrapped\s*\(\d+\)\)/gi, // (20 Individually Wrapped (1))
    ];
    
    packPatterns.forEach(pattern => {
        improvedTitle = improvedTitle.replace(pattern, '');
    });
    
    // 2. Remove ONLY total weight information for multi-packs
    const totalWeightPatterns = [
        /\s*\(Total\s+\d+oz\)/gi,             // (Total 28oz)
        /\s*\(Total\s+\d+\.\d+oz\)/gi,        // (Total 28.5oz)
    ];
    
    totalWeightPatterns.forEach(pattern => {
        improvedTitle = improvedTitle.replace(pattern, '');
    });
    
    // 3. Clean up multiple commas and extra spaces
    improvedTitle = improvedTitle.replace(/,\s*,/g, ','); // Remove double commas
    improvedTitle = improvedTitle.replace(/,\s*$/g, ''); // Remove trailing comma
    improvedTitle = improvedTitle.replace(/\s+/g, ' '); // Normalize spaces
    improvedTitle = improvedTitle.trim();
    
    // 4. Special case: Complete truncated titles
    if (improvedTitle.includes('Assortn') && !improvedTitle.includes('Assortment')) {
        improvedTitle = improvedTitle.replace('Assortn', 'Assortment, 33.31 oz, 18 Bars Bulk Candy Box');
    }
    
    return improvedTitle;
}

// Function to check if seller is approved (with common variations)
function isApprovedSeller(seller) {
    if (!seller) return false;
    
    const approvedSellers = [
        'Ace Hardware', 'Best Buy', 'BJ\'s', 'CVS', 'Dick\'s Sporting Goods', 
        'Dollar General', 'Dollar Tree', 'Family Dollar', 'GameStop', 'Five Below', 
        'The Home Depot', 'Kohl\'s', 'Lowe\'s', 'Macy\'s', 'Michael\'s', 'PetSmart', 
        'Rite Aid', 'Rhode Island Novelty', 'Sam\'s Club', 'Shaw\'s', 'Staples', 'Stop&Shop', 
        'Target', 'VitaCost.com','VitaCost','Instacart', 'Walmart', 'Walgreens', 'WebstaurantStore.com'
    ];
    
    const normalizedSeller = seller.trim();
    
    // Check for exact matches first
    const exactMatch = approvedSellers.some(approved => {
        const approvedLower = approved.toLowerCase();
        const sellerLower = normalizedSeller.toLowerCase();
        return sellerLower === approvedLower;
    });
    
    if (exactMatch) return true;
    
    // Check for common variations
    const sellerLower = normalizedSeller.toLowerCase();
    
    // Walgreens variations
    if (sellerLower === 'walgreens.com' || sellerLower === 'walgreens store' || sellerLower === 'walgreens pharmacy') {
        return true;
    }
    
    // Walmart variations
    if (sellerLower === 'walmart.com' || sellerLower === 'walmart store') {
        return true;
    }
    
    // Stop&Shop variations
    if (sellerLower === 'stop & shop' || sellerLower === 'stop and shop') {
        return true;
    }
    
    return false;
}

// Function to calculate price range with fallback for missing data
function calculatePriceRange(keepaRecord) {
    // Try to get price from various Keepa fields
    let keepaPrice = 0;
    
    // Priority order: New Current > Buy Box Current > New 30 days avg > New 180 days avg > Buy Box 90 days avg
    const priceFields = [
        'New: Current',
        'Buy Box: Current', 
        'New: 30 days avg.',
        'New: 180 days avg.',
        'Buy Box: 90 days avg.'
    ];
    
    for (const field of priceFields) {
        const price = cleanAndParsePrice(keepaRecord[field]);
        if (price > 0) {
            keepaPrice = price;
            break;
        }
    }
    
    // If no price data available, use default ranges
    if (keepaPrice === 0) {
        return {
            minPrice: 1,
            maxPrice: 50, // Default max for unknown products
            hasPriceData: false
        };
    }
    
    // Calculate profitable price range
    const minPrice = Math.max(1, keepaPrice * 0.1); // At least 30% of Amazon price
    const maxPrice = keepaPrice * 0.7; // Max 70% of Amazon price for good margin
    
    return {
        minPrice: minPrice.toFixed(2),
        maxPrice: maxPrice.toFixed(2),
        hasPriceData: true,
        keepaPrice: keepaPrice
    };
}

// Function to filter and prioritize shopping results
function filterAndPrioritizeResults(shoppingResults, keepaRecord) {
    if (!Array.isArray(shoppingResults)) {
        return [];
    }
    
    const priceRange = calculatePriceRange(keepaRecord);
    
    // Filter and score each result
    const scoredResults = shoppingResults.map(result => {
        let score = 0;
        let reasons = [];
        
        // Check if seller is approved (highest priority)
        const sellerApproved = isApprovedSeller(result.seller);
        if (sellerApproved) {
            score += 100;
            reasons.push('Approved seller');
        } else {
            score -= 50;
            reasons.push('Unapproved seller');
        }
        
        // Check price if we have Keepa price data
        if (priceRange.hasPriceData && result.extracted_price) {
            const shoppingPrice = parseFloat(result.extracted_price);
            const keepaPrice = priceRange.keepaPrice;
            
            // Calculate potential profit
            const maxAllowedCost = keepaPrice - (keepaPrice * 0.15) - 5.00 - 2.00;
            
            if (shoppingPrice <= maxAllowedCost) {
                score += 50;
                reasons.push('Profitable price');
            } else {
                score -= 30;
                reasons.push('Price too high');
            }
        }
        
        // Bonus for all approved sellers (they are all high-value for arbitrage)
        const highValueSellers = [
            'Ace Hardware', 'Best Buy', 'BJ\'s', 'CVS', 'Dick\'s Sporting Goods', 
            'Dollar General', 'Dollar Tree', 'Family Dollar', 'GameStop', 'Five Below', 
            'The Home Depot', 'Kohl\'s', 'Lowe\'s', 'Macy\'s', 'Michael\'s', 'PetSmart', 
            'Rite Aid', 'Rhode Island Novelty', 'Sam\'s Club', 'Shaw\'s', 'Staples', 'Stop&Shop', 
            'Target', 'VitaCost.com','VitaCost','Instacart', 'Walmart', 'Walgreens.com', 'WebstaurantStore.com', 'Walgreens'
        ];
        if (highValueSellers.some(seller => result.seller && result.seller.includes(seller))) {
            score += 20;
            reasons.push('High-value seller');
        }
        
        // Bonus for products with good ratings
        if (result.rating && result.rating >= 4.0) {
            score += 10;
            reasons.push('Good rating');
        }
        
        // Bonus for products with many reviews
        if (result.reviews && result.reviews >= 100) {
            score += 5;
            reasons.push('Many reviews');
        }
        
        return {
            ...result,
            score,
            reasons,
            sellerApproved
        };
    });
    
    // Sort by score (highest first) and filter out very low scores
    return scoredResults
        .filter(result => result.score > -50) // Remove very poor matches
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // Return top 10 results
}

// Function to analyze API response and show approved sellers by position
function analyzeApiResponseForApprovedSellers(apiResponse) {
    if (!apiResponse || !apiResponse.shopping_results || !Array.isArray(apiResponse.shopping_results)) {
        console.log('No valid shopping results found in API response');
        return [];
    }
    
    console.log('=== ANALYZING API RESPONSE FOR APPROVED SELLERS ===');
    console.log(`Total results found: ${apiResponse.shopping_results.length}`);
    
    const approvedSellers = [
        'Ace Hardware', 'Best Buy', 'BJ\'s', 'CVS', 'Dick\'s Sporting Goods', 
        'Dollar General', 'Dollar Tree', 'Family Dollar', 'GameStop', 'Five Below', 
        'The Home Depot', 'Kohl\'s', 'Lowe\'s', 'Macy\'s', 'Michael\'s', 'PetSmart', 
        'Rite Aid', 'Rhode Island Novelty', 'Sam\'s Club', 'Shaw\'s', 'Staples', 'Stop&Shop', 
        'Target', 'VitaCost.com','VitaCost','Instacart', 'Walmart', 'Walgreens.com', 'WebstaurantStore.com', 'Walgreens'
    ];
    
    const analysisResults = [];
    
    apiResponse.shopping_results.forEach((result, index) => {
        const position = result.position || (index + 1);
        const seller = result.seller || 'Unknown';
        const title = result.title || 'No title';
        const price = result.price || 'No price';
        
        // Check if seller is approved
        const sellerApproved = isApprovedSeller(seller);
        
        const analysis = {
            position: position,
            seller: seller,
            title: title,
            price: price,
            approved: sellerApproved,
            reason: sellerApproved ? 'Approved seller' : 'Not in approved list'
        };
        
        analysisResults.push(analysis);
        
        // Log each result
        const status = sellerApproved ? '✅ APPROVED' : '❌ REJECTED';
        console.log(`Position ${position}: ${status} - ${seller} - ${price} - "${title}"`);
    });
    
    // Summary
    const approvedCount = analysisResults.filter(r => r.approved).length;
    const totalCount = analysisResults.length;
    
    console.log('\n=== SUMMARY ===');
    console.log(`Total results: ${totalCount}`);
    console.log(`Approved sellers: ${approvedCount}`);
    console.log(`Rejected sellers: ${totalCount - approvedCount}`);
    console.log(`Approval rate: ${((approvedCount / totalCount) * 100).toFixed(1)}%`);
    
    // Show only approved results
    const approvedResults = analysisResults.filter(r => r.approved);
    if (approvedResults.length > 0) {
        console.log('\n=== APPROVED SELLERS ONLY ===');
        approvedResults.forEach(result => {
            console.log(`Position ${result.position}: ${result.seller} - ${result.price} - "${result.title}"`);
        });
    } else {
        console.log('\n❌ No approved sellers found in this response');
    }
    
    console.log('=== END ANALYSIS ===\n');
    
    return analysisResults;
}

// Function to improve Keepa title using AI before API search
async function improveKeepaTitleWithAI(keepaTitle) {
    try {
        console.log('=== IMPROVING KEEPA TITLE WITH AI ===');
        console.log('Original title:', keepaTitle);
        
        // Import the Gemini analysis function
        const { analyzeProduct } = require('./geminiAnalysis');
        
        // Create a prompt to extract essential product information
        const prompt = `Extract only the essential product information from this title for a shopping search. 
        
        Keep ONLY:
        - Brand name
        - Product type/model/kind
        - Weight/size (if present)
        - Key distinguishing features
        
        Remove:
        - Marketing words (new, original, family, etc.)
        - Unnecessary descriptions
        - Extra details that don't help search
        
        Format: "Brand ProductType Weight" (if weight exists)
        
        Title: "${keepaTitle}"
        
        Return ONLY the cleaned title, nothing else.`;
        
        // Use a simple approach since we don't want to make an API call here
        // We'll use a rule-based approach that mimics AI behavior
        const improvedTitle = extractEssentialProductInfo(keepaTitle);
        
        console.log('Improved title:', improvedTitle);
        console.log('=== END TITLE IMPROVEMENT ===\n');
        
        return improvedTitle;
        
    } catch (error) {
        console.error('Error improving title with AI:', error);
        // Fallback to original title if AI fails
        return keepaTitle;
    }
}

// Rule-based function to extract essential product information (AI-like behavior)
function extractEssentialProductInfo(title) {
    if (!title) return '';
    
    // Convert to lowercase for processing
    const lowerTitle = title.toLowerCase();
    
    // First, identify the brand from the title to protect it
    const identifiedBrand = identifyBrandFromTitle(title);
    console.log('Identified brand from title:', identifiedBrand);
    
    
    
   
    // Extract pack/quantity information first
    const packPatterns = [
        /pack\s+of\s+(\d+)/gi,
        /(\d+)\s*pack/gi,
        /(\d+)\s*pieces?/gi,
        /(\d+)\s*count/gi,
        /(\d+)\s*units?/gi,
        /(\d+)\s*ct/gi,
        /total\s+(\d+[.\d]*\s*(?:oz|lb|g|kg))/gi,
        /(\d+[.\d]*\s*(?:oz|lb|g|kg)\s+total)/gi
    ];
    
    let packInfo = '';
    let processedTitle = title;
    
    // Find and extract pack information
    for (const pattern of packPatterns) {
        const match = processedTitle.match(pattern);
        if (match) {
            packInfo = match[0];
            // Remove the pack info from the title for further processing
            processedTitle = processedTitle.replace(pattern, '').replace(/\s+/g, ' ').trim();
            break;
        }
    }
    
    // Split title into words
    let words = processedTitle.split(' ');
    
    // Filter out unnecessary words
    words = words.filter(word => {
        const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
        return !wordsToRemove.includes(cleanWord) && cleanWord.length > 1;
    });
    
    // Extract brand (usually first word or common brands)
    const commonBrands = [
        'nike', 'adidas', 'sony', 'samsung', 'apple', 'lg', 'dell', 'hp', 'lenovo', 'asus',
        'kellogg', 'general', 'mills', 'nestle', 'coca', 'cola', 'pepsi', 'kraft', 'heinz',
        'campbell', 'progresso', 'quaker', 'post', 'cheerios', 'special', 'rice', 'krispies',
        'frosted', 'flakes', 'corn', 'pops', 'lucky', 'charms', 'cinnamon', 'toast', 'crunch',
        'honey', 'nut', 'cheerios', 'wheaties', 'total', 'raisin', 'bran', 'shredded', 'wheat',
        'cocoa', 'puffs', 'trix', 'fruity', 'pebbles', 'captain', 'crunch', 'life', 'cereal',
        'twix', 'snickers', 'mars', 'kit', 'kat', 'reeses', 'm&m', 'hershey', 'cadbury',
        'dove', 'milky', 'way', 'butterfinger', 'baby', 'ruth', 'almond', 'joy', 'mounds',
        'york', 'peppermint', 'patty', 'junior', 'mints', 'rolo', 'caramello', 'take', 'five',
        'unreal', 'lindt', 'ghirardelli', 'godiva', 'dove', 'milka', 'ferrero', 'rocher',
        'toblerone', 'cadbury', 'nestle', 'kraft', 'hershey', 'mars', 'wrigley', 'haribo',
        'skittles', 'starburst', 'jolly', 'rancher', 'airheads', 'nerds', 'sour', 'patch',
        'swedish', 'fish', 'gummy', 'bears', 'worms', 'jelly', 'beans', 'mike', 'ike',
        'partake', 'kindling', 'protein', 'pretzels', 'graham', 'cracker', 'minis', 'vegan',
        'seapoint', 'farms', 'mighty', 'lil', 'lentils', 'falafel', 'sonoma', 'creamery'
    ];
    
    let brand = '';
    let productWords = [];
    
    // Try to identify brand
    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase().replace(/[^\w]/g, '');
        if (commonBrands.includes(word)) {
            brand = words[i];
            // Get next few words as product description, but be more selective
            productWords = words.slice(i + 1, i + 6);
            break;
        }
    }
    
    // If no brand found, use first word as potential brand
    if (!brand && words.length > 0) {
        brand = words[0];
        productWords = words.slice(1, 6);
    }
    
    // Filter out words that are just marketing terms from product description
    const marketingTerms = [
        'organic', 'natural', 'healthy', 'quality', 'ingredients', 'fair', 'trade', 'non-gmo', 
        'no', 'syrup', 'alcohols', 'soy', 'free', 'gluten', 'vegan', 'dairy', 'wheat', 'eggs', 
        'peanuts', 'artificial', 'flavors', 'sugar', 'total', 'serving', 'packed', 'kosher',
        'allergens', 'including', 'from', 'top', 'safe', 'school', 'office', 'snack', 'snacks',
        'lunches', 'on-the-go', 'only', 'per', 'g', 'oz', 'bags', 'pack', 'packs'
    ];
    
    // Keep important product descriptors
    const keepWords = [
        'classic', 'graham', 'cracker', 'minis', 'protein', 'pretzels', 'sea', 'salt',
        'chocolate', 'caramel', 'peanut', 'nougat', 'bars', 'dark', 'milk', 'white',
        'cereal', 'candy', 'chips', 'cookies', 'biscuits', 'crackers', 'nuts', 'seeds',
        'fruit', 'berries', 'apple', 'banana', 'strawberry', 'blueberry', 'raspberry',
        'lentils', 'falafel', 'mighty', 'lil', 'seapoint', 'farms', 'cheese', 'crisps'
    ];
    
    productWords = productWords.filter(word => {
        const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
        // Keep if it's in the keepWords list or if it's not in marketingTerms
        return keepWords.includes(cleanWord) || !marketingTerms.includes(cleanWord);
    });
    
    // Extract and preserve weight information (including grams)
    const weightPattern = /(\d+(?:\.\d+)?)\s*(oz|g|lb|lbs|kg|pounds|kilograms|ounce|ounces|grams?)/gi;
    let weightInfo = '';
    
    // Look for weight in the original title
    const weightMatch = title.match(weightPattern);
    if (weightMatch) {
        weightInfo = weightMatch[0];
    }
    
    // Combine brand, product words, weight info, and pack info
    const essentialInfo = [brand, ...productWords].filter(word => word && word.length > 0);
    
    // Add weight info if found
    if (weightInfo) {
        essentialInfo.push(weightInfo);
    }
    
    // Add pack info if found
    if (packInfo) {
        essentialInfo.push(packInfo);
    }
    
    // Limit to reasonable length (max 8 words)
    const result = essentialInfo.slice(0, 8).join(' ');
    
    return result || title; // Fallback to original if nothing extracted
}

// Function to identify brand from title before processing
function identifyBrandFromTitle(title) {
    if (!title) return null;
    
    const words = title.split(' ');
    const commonBrands = [
        'nike', 'adidas', 'sony', 'samsung', 'apple', 'lg', 'dell', 'hp', 'lenovo', 'asus',
        'kellogg', 'general', 'mills', 'nestle', 'coca', 'cola', 'pepsi', 'kraft', 'heinz',
        'campbell', 'progresso', 'quaker', 'post', 'cheerios', 'special', 'rice', 'krispies',
        'frosted', 'flakes', 'corn', 'pops', 'lucky', 'charms', 'cinnamon', 'toast', 'crunch',
        'honey', 'nut', 'cheerios', 'wheaties', 'total', 'raisin', 'bran', 'shredded', 'wheat',
        'cocoa', 'puffs', 'trix', 'fruity', 'pebbles', 'captain', 'crunch', 'life', 'cereal',
        'twix', 'snickers', 'mars', 'kit', 'kat', 'reeses', 'm&m', 'hershey', 'cadbury',
        'dove', 'milky', 'way', 'butterfinger', 'baby', 'ruth', 'almond', 'joy', 'mounds',
        'york', 'peppermint', 'patty', 'junior', 'mints', 'rolo', 'caramello', 'take', 'five',
        'unreal', 'lindt', 'ghirardelli', 'godiva', 'milka', 'ferrero', 'rocher',
        'toblerone', 'wrigley', 'haribo', 'skittles', 'starburst', 'jolly', 'rancher',
        'airheads', 'nerds', 'sour', 'patch', 'swedish', 'fish', 'gummy', 'bears',
        'worms', 'jelly', 'beans', 'mike', 'ike', 'partake', 'kindling', 'protein',
        'pretzels', 'graham', 'cracker', 'minis', 'vegan', 'seapoint', 'farms', 'mighty', 'lil', 'lentils', 'falafel', 'sonoma', 'creamery', 'nature', 'bakery'
    ];
    
    // Check for multi-word brands first (like "Seapoint Farms")
    for (let i = 0; i < words.length - 1; i++) {
        const twoWordBrand = `${words[i]} ${words[i + 1]}`.toLowerCase();
        if (commonBrands.includes(twoWordBrand)) {
            return `${words[i]} ${words[i + 1]}`;
        }
    }
    
    // Check for single word brands
    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase();
        if (commonBrands.includes(word)) {
            return words[i]; // Return original case
        }
    }
    
    // If no known brand found, assume first word might be a brand
    if (words.length > 0) {
        const firstWord = words[0];
        // Check if first word looks like a brand (capitalized, not a common word)
        const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        if (!commonWords.includes(firstWord.toLowerCase()) && firstWord.length > 2) {
            return firstWord;
        }
    }
    
    return null;
}


const Api = db.sequelize.define('Api', {

    keepa_id: {
        type: db.Sequelize.STRING(1000),
        FOREIGNKEYS: true
    },
    status: {
        type: db.Sequelize.STRING(500),
        allowNull: true
    },
    total_time_taken: {
        type: db.Sequelize.STRING(500),
        allowNull: true
    },
    request_url: {
        type: db.Sequelize.STRING(4000),
        allowNull: true
    },
    html_url: {
        type: db.Sequelize.STRING(4000),
        allowNull: true
    },
    json_url: {
        type: db.Sequelize.STRING(4000),
        allowNull: true
    },
    q: {
        type: db.Sequelize.STRING(2000),
        allowNull: true
    }

});

// Sync model
(async () => {
    try {
        await db.sequelize.authenticate();
        console.log('Connection has been established successfully.');
        await Api.sync(); // Use alter to update column lengths
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
        type: db.Sequelize.STRING(1000),
        allowNull: false
    },
    product_id: {
        type: db.Sequelize.STRING(1000),
        allowNull: true
    },
    position: {
        type: db.Sequelize.INTEGER,
        allowNull: true
    },
    title: {
        type: db.Sequelize.STRING(2000),
        allowNull: true
    },
    seller: {
        type: db.Sequelize.STRING(1000),
        allowNull: true
    },
    link: {
        type: db.Sequelize.STRING(4000),
        allowNull: true
    },
    price: {
        type: db.Sequelize.STRING(100),
        allowNull: true
    },
    order_fullfillmed_method: {
        type: db.Sequelize.STRING(1000),
        allowNull: true
    },
    delivery: {
        type: db.Sequelize.STRING(1000),
        allowNull: true
    },
    thumbnail: {
        type: db.Sequelize.STRING(4000),
        allowNull: true
    }
});

// Sync model
(async () => {
    try {
        await db.sequelize.authenticate();
        console.log('Connection has been established successfully.');
        await Products.sync(); // Use alter to update column lengths
        console.log('Products table synchronized.');
    } catch (err) {
        console.error('Unable to connect to the database:', err);
    }
})();




module.exports = {
    Products,
    Api,
    insertProductData,
    avgPriceKeepa,
    getWeight,
    getUnitCount,
    isApprovedSeller,
    calculatePriceRange,
    filterAndPrioritizeResults,
    analyzeApiResponseForApprovedSellers,
    improveKeepaTitleWithAI,
    improveKeepaTitleForSearch,
    extractEssentialProductInfo,
    identifyBrandFromTitle
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