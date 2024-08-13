const { DataTypes } = require('sequelize');
const db = require('./database');

const User = db.sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true 
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

module.exports = User;



// Synchronize the model with the database
(async () => {
  try {
    //await User.sync(); 
    await User.sync({force:true}); // force
    console.log('User table synchronized.');
  } catch (error) {
    console.error('Error synchronizing User table:', error); 
  }
})(); 

module.exports = User; 