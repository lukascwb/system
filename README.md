# Sistema de Análise de Produtos

## 🚀 Instalação Rápida

### 1. Pré-requisitos
- Node.js (https://nodejs.org/)
- MySQL (https://dev.mysql.com/downloads/mysql/)

### 2. Clone e Instale
```bash
git clone [URL_DO_REPOSITORIO]
cd system
npm install
```

### 3. Configure o Banco de Dados
```bash
# Crie o banco de dados no MySQL
mysql -u root -p
CREATE DATABASE sistema_analise_produtos;
exit;
```

### 4. Configure as Variáveis
Crie um arquivo `.env` na raiz do projeto:
```env
DATABASE_NAME=sistema_analise_produtos
DATABASE_USER=root
DATABASE_PASSWORD=sua_senha_mysql
GOOGLE_API_KEY=sua_chave_gemini
api_key=sua_chave_searchapi
secret=chave_secreta_123
```

### 5. Execute
```bash
npm start
```

### 6. Acesse
http://localhost:8081

## 🔑 Chaves de API Necessárias

- **Google Gemini**: https://makersuite.google.com/app/apikey
- **SearchAPI**: https://www.searchapi.io/

## ❗ Problemas Comuns

- **Erro de módulos**: `npm install`
- **Erro de banco**: Verifique se MySQL está rodando
- **Erro de API**: Verifique as chaves no `.env` 