/**
 * Gera os ícones do app (PNGs + .ico) a partir do SVG do logo.
 *
 * Fonte: resources/logo-icone.svg (ícone quadrado).
 * Saída:  resources/icons/icon-<tamanho>.png e resources/icon.ico
 *
 * O electron-builder usa resources/icon.ico como ícone do app/instalador
 * (Windows). Reexecutar este script regenera tudo de forma determinística.
 *
 * Uso: npm run icons
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");
const svgEntrada = resolve(raiz, "resources/logo-icone.svg");
const dirIcons = resolve(raiz, "resources/icons");
const icoSaida = resolve(raiz, "resources/icon.ico");

// Tamanhos de PNG a gerar. Os menores vão também para o .ico (multi-resolução).
const TAMANHOS_PNG = [16, 24, 32, 48, 64, 128, 256, 512];
// O .ico embute estes tamanhos (padrão Windows).
const TAMANHOS_ICO = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  await mkdir(dirIcons, { recursive: true });

  // Renderiza um PNG para cada tamanho a partir do SVG.
  const pngPorTamanho = new Map();
  for (const tam of TAMANHOS_PNG) {
    const buffer = await sharp(svgEntrada, { density: 384 })
      .resize(tam, tam, { fit: "contain" })
      .png()
      .toBuffer();
    const caminho = resolve(dirIcons, `icon-${tam}.png`);
    await writeFile(caminho, buffer);
    pngPorTamanho.set(tam, buffer);
    console.log(`PNG  ${tam}x${tam}  -> resources/icons/icon-${tam}.png`);
  }

  // Monta o .ico multi-resolução a partir dos buffers já renderizados.
  const buffersIco = TAMANHOS_ICO.map((t) => pngPorTamanho.get(t)).filter(
    (b) => b !== undefined,
  );
  const ico = await pngToIco(buffersIco);
  await writeFile(icoSaida, ico);
  console.log(`ICO  (${TAMANHOS_ICO.join(",")})  -> resources/icon.ico`);

  console.log("\nÍcones gerados com sucesso.");
}

main().catch((erro) => {
  console.error("Falha ao gerar ícones:", erro);
  process.exit(1);
});
