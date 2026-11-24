import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de interface do app: botões lado a lado devem usar <BotoesLado>. Montar a linha à mão
 * (um View com flex: 1 ao redor de cada Botao) já deixou um botão mais alto que o vizinho quando
 * o título quebrava em duas linhas. Este teste lê o código das telas, sem rodar o app.
 */
const TELAS = join(__dirname, "../../mobile/src");

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(join(pasta, e.name)) : /\.tsx$/.test(e.name) ? [join(pasta, e.name)] : [],
  );
}

describe("botões lado a lado no app", () => {
  it("nenhuma tela monta a linha à mão: usa <BotoesLado>", () => {
    const manuais: string[] = [];
    for (const arquivo of arquivos(TELAS)) {
      // Componentes do próprio design system são onde essa estrutura é permitida.
      if (arquivo.endsWith("ui/componentes.tsx")) continue;
      const linhas = readFileSync(arquivo, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        // Um View de flex: 1 seguido, nas 2 linhas seguintes, de um <Botao ...> é a montagem manual.
        if (/<View style=\{\{ flex: 1 \}\}>/.test(linha) && linhas.slice(i + 1, i + 3).some((l) => /<Botao\b/.test(l))) {
          manuais.push(`${arquivo.replace(TELAS, "mobile/src")}:${i + 1}`);
        }
      });
    }
    expect(manuais, `Use <BotoesLado> de ui/componentes em vez de View flex:1 ao redor de Botao:\n${manuais.join("\n")}`).toEqual([]);
  });

  it("o Botao pequeno fica numa linha só e o texto é centralizado", () => {
    const codigo = readFileSync(join(TELAS, "ui/componentes.tsx"), "utf8");
    expect(codigo).toMatch(/numberOfLines=\{pequeno \? 1 : undefined\}/);
    expect(codigo).toMatch(/botaoTexto: \{[^}]*textAlign: "center"/);
  });
});
