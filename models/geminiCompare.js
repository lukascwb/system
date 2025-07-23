const { GoogleGenerativeAI } = require('@google/generative-ai');

async function compararTitulosGemini(keepaTitle, productTitle) {
    try {
        const prompt = `\nCompare os títulos abaixo e responda apenas com "Aprovado" se forem o mesmo produto, ou "Reprovado" se não forem. Seja rigoroso, só aprove se for realmente o mesmo produto.\n\nTítulo Keepa: "${keepaTitle}"\nTítulo Produto: "${productTitle}"\n`;

        const API_KEY = process.env.GOOGLE_API_KEY;
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const result = await model.generateContent(prompt);
        const resposta = result.response.text().trim();

        // Print para debug
        console.log(`[Gemini] Comparando:\nKeepa: ${keepaTitle}\nProduto: ${productTitle}\nResposta: ${resposta}`);

        // Normaliza resposta
        if (resposta.toLowerCase().includes('aprovado')) return 'Aprovado';
        return 'Reprovado';
    } catch (error) {
        console.error('[Gemini] Erro ao comparar títulos:', error);
        return 'Reprovado';
    }
}

module.exports = { compararTitulosGemini }; 