import type { NextConfig } from "next";

// Cabeçalhos de segurança aplicados a todas as respostas.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Não revela que o servidor roda Next.js.
  poweredByHeader: false,
  // pdfkit lê as métricas das fontes (.afm) do próprio diretório em tempo de
  // execução. Empacotado no chunk, esses arquivos ficam de fora e a geração
  // do PDF quebra no container — mantendo-o externo, o tracing copia o pacote
  // inteiro para o standalone. `docx` acompanha pelo mesmo motivo (templates).
  // pdfkit e docx ficam fora do bundle: o build CJS do pdfkit lê as métricas
  // de fonte (.afm) do próprio diretório e resolve dependências em tempo de
  // execução, o que o tracing estático não consegue acompanhar. A imagem
  // instala os dois com a árvore completa (ver Dockerfile, estágio docdeps).
  serverExternalPackages: ["pdfkit", "docx"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
