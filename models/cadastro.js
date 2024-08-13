const db = require('./database')
const Aluno = db.sequelize.define('alunos',
{
    nome:{
        type: db.Sequelize.STRING
    },
    idade:
    {
        type: db.Sequelize.INTEGER
    }
})


module.exports =  Aluno 