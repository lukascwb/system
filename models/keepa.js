const  db = require('./database');

const { v4: uuidv4 } = require('uuid');

// Define KeepaCSV model
// keepaModel.js


// ... (Sequelize setup - same as before) ...

const KeepaCSV = db.sequelize.define('KeepaCSV', {
  keepa_id: {
    type: db.Sequelize.STRING,
    allowNull: false
  },
  Title: {
    type: db.Sequelize.STRING,
    allowNull: false
  },
  Image: {
    type: db.Sequelize.STRING,
    allowNull: true
  },
  'Sales Rank: Current': {
    type: db.Sequelize.INTEGER,
    allowNull: true
  },
  'Buy Box: Current': {
    type: db.Sequelize.STRING, 
    allowNull: true
  },
  'Buy Box: 90 days avg.': {
    type: db.Sequelize.STRING,
    allowNull: true
  },
  'Sales Rank: 30 days avg.': {
    type: db.Sequelize.INTEGER,
    allowNull: true
  },
  'Sales Rank: 180 days avg.': {
    type: db.Sequelize.INTEGER,
    allowNull: true
  },
  'Reviews: Ratings - Format Specific': {
    type: db.Sequelize.DECIMAL, 
    allowNull: true
  },
  'Variation Count': {
    type: db.Sequelize.INTEGER,
    allowNull: true
  },
  'Reviews: Review Count - Format Specific': {
    type: db.Sequelize.INTEGER,
    allowNull: true
  },
  'New: Current': {
    type: db.Sequelize.STRING, 
    allowNull: true
  },
  'New: 30 days avg.': {
    type: db.Sequelize.STRING, 
    allowNull: true
  },
  'New: 180 days avg.': {
    type: db.Sequelize.STRING,
    allowNull: true
  },
  'New Offer Count: Current': {
    type: db.Sequelize.STRING, 
    allowNull: true
  },
  'URL: Amazon': {
    type: db.Sequelize.STRING,
    allowNull: true
  },
  ASIN: {
    type: db.Sequelize.STRING,
    allowNull: false 
  },
  Brand: {
    type: db.Sequelize.STRING,
    allowNull: true
  },
  'Variation Attributes': {
    type: db.Sequelize.STRING, 
    allowNull: true
  },
  'Item: Weight (g)': {
    type: db.Sequelize.STRING,
    allowNull: true
  },
  'Bought in past month': {
    type: db.Sequelize.INTEGER,
    allowNull: true
  },
  'Buy Box: Is FBA': {
    type: db.Sequelize.STRING,
    allowNull: true
  },
  'Buy Box: % Amazon 365 days': {
    type: db.Sequelize.STRING, 
    allowNull: true
  },
  'New Offer Count: 30 days avg.': {
    type: db.Sequelize.INTEGER,
    allowNull: true
  },
  'New Offer Count: 180 days avg.': {
    type: db.Sequelize.INTEGER,
    allowNull: true
  },
  'Subcategory Sales Ranks': {
    type: db.Sequelize.STRING, 
    allowNull: true
  }

  
});

// ... (Synchronization and module.exports - same as before) ...


// Synchronize model with database (optional - if you need to create the table)
(async () => {
  try {
    await db.sequelize.authenticate();
    console.log('KeepaCSV -Connection has been established successfully.');
    //await KeepaCSV.sync(); // Create table if it doesn't exist
    await KeepaCSV.sync({force:true}); // force
    console.log('KeepaCSV table synchronized.');
  } catch (err) {
    console.error('Unable to connect to the database:', err);
  }
})();

module.exports = KeepaCSV; 
