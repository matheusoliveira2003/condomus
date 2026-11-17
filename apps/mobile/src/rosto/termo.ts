/**
 * Termo de consentimento lido para o visitante antes de cadastrar o rosto. A versão precisa ser
 * igual à da API (TERMO_ROSTO_VERSAO em apps/api/src/modules/rostos/routes.ts): ao mudar o
 * texto, mude a versão nos dois lugares.
 */
export const TERMO_ROSTO_VERSAO = "2026-11b";

export const TERMO_ROSTO_PARAGRAFOS = [
  "Para agilizar suas próximas entradas, a portaria pode guardar uma foto do seu rosto.",
  "Nas próximas visitas, o app compara o seu rosto com essa foto e libera a entrada quando reconhece você. Se não reconhecer, o porteiro confere o seu documento e pode liberar a entrada por conta própria.",
  "A foto é um dado biométrico, ligado ao seu documento e usado só para isso. Ela não é compartilhada e só a portaria deste condomínio pode vê-la.",
  "A foto é apagada automaticamente depois de 30 dias sem visitas. Você pode pedir ao porteiro para apagá-la a qualquer momento.",
  "O cadastro é opcional: sem ele, sua entrada continua sendo feita normalmente, pelo documento.",
];
