import { describe, expect, it } from "vitest";
import { contarPorDia, contarPorMes, faixaNoDia } from "./intervalos";

// Os testes usam o fuso local da máquina; datas construídas com new Date(ano, mes, dia, hora) ficam no mesmo fuso.
const dia = new Date(2026, 10, 25); // 25/11/2026
const at = (h: number, d = 25) => new Date(2026, 10, d, h);

describe("faixaNoDia: a linha do tempo vai das 8h às 23h", () => {
  it("uma reserva dentro do horário vira uma faixa proporcional", () => {
    // 10h às 12h: (10-8)/15 = 13,33% até (12-8)/15 = 26,67%
    const f = faixaNoDia(at(10), at(12), dia)!;
    expect(f.inicioPct).toBeCloseTo(13.33, 1);
    expect(f.fimPct).toBeCloseTo(26.67, 1);
  });

  it("reserva antes das 8h é cortada na abertura", () => {
    const f = faixaNoDia(at(6), at(10), dia)!;
    expect(f.inicioPct).toBeCloseTo(0, 5);
    expect(f.fimPct).toBeCloseTo(13.33, 1);
  });

  it("reserva depois das 23h some da linha", () => {
    expect(faixaNoDia(at(23), at(23, 25), dia)).toBeNull();
    expect(faixaNoDia(at(22), at(23, 30), dia)?.fimPct).toBeCloseTo(100, 5);
  });

  it("reserva que atravessa a meia-noite aparece só no dia em que começa, cortada na meia-noite", () => {
    const aparece = faixaNoDia(at(22), new Date(2026, 10, 26, 2), dia);
    expect(aparece?.fimPct).toBeCloseTo(100, 5); // corta às 23h, que é o fim da linha
    expect(faixaNoDia(at(22), new Date(2026, 10, 26, 2), new Date(2026, 10, 26))).toBeNull(); // o dia seguinte começa à meia-noite, fora da linha
  });

  it("reserva em outro dia não aparece", () => {
    expect(faixaNoDia(at(10, 24), at(12, 24), dia)).toBeNull();
  });
});

describe("contarPorDia e contarPorMes", () => {
  const reservas = [
    { inicio: at(10, 3).toISOString(), fim: at(12, 3).toISOString() },
    { inicio: at(14, 3).toISOString(), fim: at(16, 3).toISOString() },
    { inicio: at(10, 20).toISOString(), fim: at(12, 20).toISOString() },
    { inicio: new Date(2026, 11, 5, 10).toISOString(), fim: new Date(2026, 11, 5, 12).toISOString() }, // dezembro
  ];

  it("conta por dia do mês, sem contar reserva de outro mês", () => {
    const porDia = contarPorDia(reservas, new Date(2026, 10, 1));
    expect(porDia[2]).toBe(2); // dia 3
    expect(porDia[19]).toBe(1); // dia 20
    expect(porDia.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("conta por mês do ano, pelo início da reserva", () => {
    const porMes = contarPorMes(reservas, new Date(2026, 0, 1));
    expect(porMes[10]).toBe(3); // novembro
    expect(porMes[11]).toBe(1); // dezembro
    expect(porMes.reduce((a, b) => a + b, 0)).toBe(4);
  });
});
