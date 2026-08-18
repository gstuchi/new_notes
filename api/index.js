import { rotear } from '../servidor.js';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const rota = url.searchParams.get('rota');
  if (rota !== null) {
    url.searchParams.delete('rota');
    const consulta = url.searchParams.toString();
    req.url = `/api/${rota}${consulta ? `?${consulta}` : ''}`;
  }

  try {
    await rotear(req, res);
  } catch (erro) {
    console.error(erro);
    if (!res.headersSent) {
      res.statusCode = erro.status || 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ erro: erro.message || 'Erro interno.' }));
    }
  }
}
