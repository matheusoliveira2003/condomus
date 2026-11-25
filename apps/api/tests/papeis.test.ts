import { describe, expect, it } from "vitest";
import { PAPEIS_MORADOR as doApp } from "@condomus/types";
import { PAPEIS_MORADOR as daApi, ehMorador } from "../src/lib/papeis.js";

// A API repete a lista (o pacote é .ts e o node de produção não o carrega); este teste impede as duas de divergirem.
describe("papéis que moram numa unidade", () => {
  it("a API e o app usam a mesma lista", () => {
    expect([...daApi].sort()).toEqual([...doApp].sort());
  });

  it("morador e síndico moram numa unidade; o porteiro não", () => {
    expect(ehMorador("MORADOR")).toBe(true);
    expect(ehMorador("SINDICO")).toBe(true);
    expect(ehMorador("PORTEIRO")).toBe(false);
    expect(ehMorador("ADMIN")).toBe(false);
  });
});
