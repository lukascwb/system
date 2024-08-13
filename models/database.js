
const Sequelize = require('sequelize');


//localhost
// const sequelize = new Sequelize('System', 'newuser', 'admin', {
//   host: 'localhost', // Or your server address
//   dialect: 'mssql', // Specify SQL Server dialect
//   dialectOptions: {
//     options: {
//       encrypt: true // If using SSL/TLS (recommended)
//     }
//   }
// });

//production
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'mysql', 
  dialectOptions: {
      encrypt: true // Use SSL/TLS for security (recommended)
  }
});


module.exports = {
  Sequelize: Sequelize,
  sequelize: sequelize,
  insertGoogleShoppingProducts: insertGoogleShoppingProducts,
  insertGoogleShoppingAPI: insertGoogleShoppingAPI,
}

// create function to insert data into database
function InsertData1(data) {
  (async () => {
    try {
      await sequelize.authenticate();
      console.log('Connection has been established successfully.');
      //await data.sync(); // Create table if it doesn't exist
      await data.sync({force:true}); // force
      console.log(data.name + ' table synchronized. 1111');
    } catch (err) {
      console.error('Unable to connect to the database:', err);
    }
  })();
}


async function insertGoogleShoppingAPI(data) {
    await GoogleShoppingAPI.create(data);
    await InsertData(GoogleShoppingAPI);
}
 
const GoogleShoppingAPI = sequelize.define('GoogleShoppingAPI', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true
  },
  
  keepa_id: {
    type: Sequelize.INTEGER,
    primaryKey: true
  },
  status: {
    type: Sequelize.STRING,
    allowNull: true
  },
  total_time_taken: {
    type: Sequelize.STRING,
    allowNull: true
  },
  request_url: {
    type: Sequelize.STRING,
    allowNull: true
  },
  html_url: {
    type: Sequelize.STRING,
    allowNull: false
  },
  json_url: {
    type: Sequelize.STRING,
    allowNull: true
  },
  q: {
    type: Sequelize.STRING,
    allowNull: true
  }

});



async function insertGoogleShoppingProducts(data) {
  await GoogleShoppingProducts.create(data);
  await InsertData(GoogleShoppingProducts);
}

const GoogleShoppingProducts = sequelize.define('GoogleShoppingProducts', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true
  },
  keepa_id: {
    type: Sequelize.INTEGER,
    primaryKey: true
  },
  product_id: {
    type: Sequelize.INTEGER,
    primaryKey: true
  },
  position: {
    type: Sequelize.INTEGER,
    allowNull: true
  },
  title: {
    type: Sequelize.STRING,
    allowNull: true
  },
  seller: {
    type: Sequelize.STRING,
    allowNull: true
  },
  link: {
    type: Sequelize.STRING,
    allowNull: true
  },
  price: {
    type: Sequelize.STRING,
    allowNull: true
  },
  order_fullfillmed_method: {
    type: Sequelize.STRING,
    allowNull: true
  },
  delivery: {
    type: Sequelize.STRING,
    allowNull: true
  },
  thumbnail: {
    type: Sequelize.STRING,
    allowNull: true
  }
});

function insertKeepaCSV(data) {
  KeepaCSV.create(data)
  insertData(KeepaCSV);
}


const KeepaCSV = sequelize.define('KeepaCSV', {
  Title: {
    type: Sequelize.STRING,
    allowNull: false
  },
  Image: {
    type: Sequelize.STRING,
    allowNull: true
  },
  'Sales Rank: Current': {
    type: Sequelize.INTEGER,
    allowNull: true
  },
  'Buy Box: Current': {
    type: Sequelize.STRING, 
    allowNull: true
  },
  'Buy Box: 90 days avg.': {
    type: Sequelize.STRING,
    allowNull: true
  },
  'Sales Rank: 30 days avg.': {
    type: Sequelize.INTEGER,
    allowNull: true
  },
  'Sales Rank: 180 days avg.': {
    type: Sequelize.INTEGER,
    allowNull: true
  },
  'Reviews: Ratings - Format Specific': {
    type: Sequelize.DECIMAL, 
    allowNull: true
  },
  'Variation Count': {
    type: Sequelize.INTEGER,
    allowNull: true
  },
  'Reviews: Review Count - Format Specific': {
    type: Sequelize.INTEGER,
    allowNull: true
  },
  'New: Current': {
    type: Sequelize.STRING, 
    allowNull: true
  },
  'New: 30 days avg.': {
    type: Sequelize.STRING, 
    allowNull: true
  },
  'New: 180 days avg.': {
    type: Sequelize.STRING,
    allowNull: true
  },
  'New Offer Count: Current': {
    type: Sequelize.STRING, 
    allowNull: true
  },
  'URL: Amazon': {
    type: Sequelize.STRING,
    allowNull: true
  },
  ASIN: {
    type: Sequelize.STRING,
    allowNull: false 
  },
  Brand: {
    type: Sequelize.STRING,
    allowNull: true
  },
  'Variation Attributes': {
    type: Sequelize.STRING, 
    allowNull: true
  },
  'Item: Weight (g)': {
    type: Sequelize.STRING,
    allowNull: true
  },
  'Bought in past month': {
    type: Sequelize.INTEGER,
    allowNull: true
  },
  'Buy Box: Is FBA': {
    type: Sequelize.STRING,
    allowNull: true
  },
  'Buy Box: % Amazon 365 days': {
    type: Sequelize.STRING, 
    allowNull: true
  },
  'New Offer Count: 30 days avg.': {
    type: Sequelize.INTEGER,
    allowNull: true
  },
  'New Offer Count: 180 days avg.': {
    type: Sequelize.INTEGER,
    allowNull: true
  }
});
/*

/*
// Test the connection

  try {
    sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error.message);
  }


const Aluno = sequelize.define('alunos',{
    nome: {
        type: Sequelize.STRING
    },
    idade: {
        type: Sequelize.INTEGER
    },
})

//Aluno.sync();

Aluno.create({
    nome: "Lucas",
    idade: 18
})*/