import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { API_URL, obterToken, type Pessoa } from "../api/client";
import { cores } from "./tema";

export const iniciais = (nome: string) => {
  const partes = nome.trim().split(/\s+/);
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
};

/**
 * Foto de perfil redonda; sem foto (ou se ela falhar ao carregar), mostra as iniciais.
 * A versão na URL faz o app baixar de novo só quando a foto muda.
 */
export function Avatar({ pessoa, tamanho = 40 }: { pessoa: Pessoa; tamanho?: number }) {
  const [falhou, setFalhou] = useState<string | null>(null);
  const forma = { width: tamanho, height: tamanho, borderRadius: tamanho / 2 };
  const versao = pessoa.fotoAtualizadaEm;

  if (versao && falhou !== versao) {
    return (
      <Image
        // Fonte dentro de uma lista de propósito: no Android (RN 0.86), uma fonte única
        // descarta `headers`, e sem o cabeçalho de login a API recusa a foto (401).
        source={[
          {
            uri: `${API_URL}/usuarios/${pessoa.id}/foto?v=${encodeURIComponent(versao)}`,
            headers: { Authorization: `Bearer ${obterToken()}` },
          },
        ]}
        style={[forma, { backgroundColor: cores.primariaClara }]}
        onError={() => setFalhou(versao)}
        accessibilityLabel={`Foto de ${pessoa.nome}`}
      />
    );
  }
  return (
    <View style={[forma, styles.iniciais]} accessibilityLabel={pessoa.nome}>
      <Text style={[styles.texto, { fontSize: tamanho * 0.38 }]}>{iniciais(pessoa.nome)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iniciais: { backgroundColor: cores.primaria, alignItems: "center", justifyContent: "center" },
  texto: { color: "#fff", fontWeight: "700" },
});
