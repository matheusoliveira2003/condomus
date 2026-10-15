# Requisitos — Condomus

## Perfis de acesso

| Perfil       | Descrição |
|--------------|-----------|
| **Morador**  | Vinculado a uma unidade. Autoriza visitantes, acompanha encomendas, lê avisos e reserva áreas comuns. |
| **Porteiro** | Funcionário da portaria. Registra entrada/saída de visitantes e recebimento/retirada de encomendas. |
| **Síndico**  | Administração. Publica avisos, cancela reservas e tem as permissões da portaria. |

## Requisitos funcionais (MVP)

### Visitantes
- **RF01** — O morador pré-autoriza um visitante (nome, documento, placa, data prevista).
- **RF02** — O morador lista e cancela visitas agendadas da sua unidade.
- **RF03** — A portaria registra a entrada de um visitante pré-autorizado.
- **RF04** — A portaria registra a entrada de um visitante sem pré-autorização, informando a unidade.
- **RF05** — A portaria registra a saída do visitante.

Ciclo de vida: `AGENDADA → EM_ANDAMENTO → FINALIZADA` (ou `AGENDADA → CANCELADA`).

### Encomendas
- **RF06** — A portaria registra o recebimento de uma encomenda para uma unidade.
- **RF07** — O morador consulta as encomendas da sua unidade.
- **RF08** — A portaria registra a retirada, com o nome de quem retirou.
- **RF09** — O morador recebe uma notificação push quando chega uma encomenda; tocar nela abre a aba Encomendas.

### Avisos
- **RF10** — O síndico publica e remove avisos, podendo fixá-los no topo.
- **RF11** — Todos os usuários visualizam o mural de avisos.

### Reservas de áreas comuns
- **RF12** — Todos visualizam as áreas e as reservas confirmadas (disponibilidade).
- **RF13** — O morador reserva uma área em um intervalo de horário futuro, sem conflito com outra reserva.
- **RF14** — O morador cancela reservas da sua unidade; o síndico cancela qualquer reserva.

### Cadastros
- **RF15** — O síndico cadastra unidades (bloco e número, sem duplicidade).
- **RF16** — O síndico cadastra moradores (vinculados a uma unidade) e funcionários (porteiro ou síndico), definindo a senha inicial.
- **RF17** — O síndico desativa e reativa contas; uma conta desativada perde o acesso imediatamente. Não há exclusão, para preservar o histórico.

### Conta
- **RF18** — Todo usuário consulta seus dados e troca a própria senha, informando a senha atual.

## Requisitos não funcionais
- **RNF01** — Autenticação por e-mail e senha, com token JWT (validade de 8h) e senhas armazenadas com bcrypt.
- **RNF02** — Toda rota, exceto login, exige autenticação; o acesso é restrito por perfil.
- **RNF03** — O morador só acessa dados da própria unidade.
- **RNF04** — Dados pessoais de visitantes (documento, placa) tratados conforme a LGPD.

## Matriz de permissões (API)

| Endpoint                          | Morador        | Porteiro | Síndico |
|-----------------------------------|----------------|----------|---------|
| `POST /auth/login`                | ✔              | ✔        | ✔       |
| `GET /auth/me`, `PATCH /auth/senha` | ✔            | ✔        | ✔       |
| `GET /visitas`                    | própria unidade| todas    | todas   |
| `POST /visitas`                   | ✔              |          |         |
| `POST /visitas/entrada-direta`    |                | ✔        | ✔       |
| `PATCH /visitas/:id/entrada`      |                | ✔        | ✔       |
| `PATCH /visitas/:id/saida`        |                | ✔        | ✔       |
| `PATCH /visitas/:id/cancelar`     | própria unidade|          |         |
| `GET /encomendas`                 | própria unidade| todas    | todas   |
| `POST /encomendas`                |                | ✔        | ✔       |
| `PATCH /encomendas/:id/retirada`  |                | ✔        | ✔       |
| `GET /avisos`                     | ✔              | ✔        | ✔       |
| `POST /avisos`, `DELETE /avisos/:id` |             |          | ✔       |
| `GET /unidades`                   |                | ✔        | ✔       |
| `POST /unidades`                  |                |          | ✔       |
| `GET /usuarios`, `POST /usuarios` |                |          | ✔       |
| `PATCH /usuarios/:id/ativo`       |                |          | ✔       |
| `PUT /dispositivos`, `DELETE /dispositivos/:token` | ✔ | ✔     | ✔       |
| `GET /areas`, `GET /reservas`     | ✔              | ✔        | ✔       |
| `POST /reservas`                  | ✔              |          |         |
| `PATCH /reservas/:id/cancelar`    | própria unidade|          | ✔       |

## Modelo de dados

```mermaid
erDiagram
  UNIDADE ||--o{ USUARIO : "moradores"
  UNIDADE ||--o{ VISITA : recebe
  UNIDADE ||--o{ ENCOMENDA : recebe
  UNIDADE ||--o{ RESERVA : faz
  USUARIO ||--o{ VISITA : "autoriza / registra"
  USUARIO ||--o{ ENCOMENDA : "recebe (porteiro)"
  USUARIO ||--o{ AVISO : publica
  USUARIO ||--o{ RESERVA : solicita
  USUARIO ||--o{ DISPOSITIVO_PUSH : "recebe notificações"
  AREA_COMUM ||--o{ RESERVA : possui
```

O esquema completo está em [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma).

## Limitações conhecidas / próximos passos
- Verificação de conflito de reservas sem bloqueio transacional (duas requisições simultâneas podem passar).
- Push no Android exige um development build (o Expo Go no Android não recebe push desde o SDK 53).

## Telas do aplicativo

| Perfil   | Abas |
|----------|------|
| Morador  | Avisos · Meus visitantes · Encomendas · Reservas |
| Porteiro | Visitantes (esperados / no condomínio / histórico) · Encomendas · Avisos |
| Síndico  | Avisos (publicar/remover) · Visitantes · Encomendas · Reservas (cancelar) · Cadastros |

O ícone de perfil no topo de todas as telas abre **Minha conta** (dados, troca de senha e sair).

A sessão fica salva no aparelho (`expo-secure-store`) e é encerrada automaticamente quando o token expira.
