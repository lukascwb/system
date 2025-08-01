# Sistema de Análise de Produtos

## 🚀 Instalação Rápida - Windows

### 1. Instalar Pré-requisitos

#### Node.js
1. Acesse: https://nodejs.org/
2. Baixe a versão LTS (recomendada)
3. Execute o instalador (.msi) e siga as instruções
4. Reinicie o computador após a instalação

#### MySQL
1. Acesse: https://dev.mysql.com/downloads/mysql/
2. Baixe "MySQL Installer for Windows"
3. Execute o instalador e siga as instruções
4. **IMPORTANTE**: Anote a senha que você definir para o usuário root!
5. Reinicie o computador após a instalação

### 2. Clone e Instale
```bash
# Abra o Command Prompt ou PowerShell
git clone [URL_DO_REPOSITORIO]
cd system
npm install
```

### 3. Configure o Banco de Dados
```bash
# Abra o MySQL Command Line Client (procure no menu Iniciar)
# Digite sua senha quando solicitado

# No MySQL, execute:
CREATE DATABASE sistema_analise_produtos;
exit;
```

### 4. Configure as Variáveis
Crie um arquivo `.env` na raiz do projeto (pode usar o Notepad):
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

## ❗ Problemas Comuns no Windows

- **Erro de módulos**: `npm install`
- **Erro de banco**: Verifique se o serviço MySQL está rodando
  - Abra "Serviços" (services.msc) e procure por "MySQL"
- **Erro de API**: Verifique as chaves no `.env`
- **Erro de permissão**: Execute o Command Prompt como Administrador
- **Erro de porta**: Verifique se a porta 8081 não está sendo usada por outro programa 