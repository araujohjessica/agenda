# Agenda — agendamento online para profissionais autônomos

![CI](https://github.com/araujohjessica/agenda/actions/workflows/ci.yml/badge.svg)

Sistema de agendamento para consultórios e profissionais autônomos: o cliente escolhe o horário e agenda em poucos cliques, e a profissional gerencia agenda, clientes e financeiro num painel só.

🔗 **Demo ao vivo:** https://agenda-eta-three.vercel.app

🧩 **API (backend):** https://github.com/araujohjessica/agenda-api

> **Versão de demonstração** com dados fictícios. O backend é simulado no navegador, então tudo funciona sem servidor.
> - **Profissional:** `profissional@exemplo.com` com qualquer senha
> - **Cliente:** `cliente@exemplo.com` com qualquer código de 6 números

## Funcionalidades

**Página pública de agendamento**
- Calendário com os dias que têm vaga e horários livres
- Agendamento sem cadastro, com consentimento de privacidade (LGPD)
- Confirmação com código e arquivo `.ics` para o calendário

**Área do cliente**
- Acesso sem senha, por código enviado por e-mail
- Remarcar e cancelar dentro das regras da profissional

**Painel da profissional**
- Agenda da semana com o nome de cada cliente
- Criação de períodos que geram horários automaticamente
- Bloqueio de horários, locais (online e presencial) e encaixes
- Consultas realizadas e faltas, lista de clientes
- Regras: antecedência mínima, prazo de cancelamento, duração e valor da sessão

**Financeiro**
- Recebido, a receber, inadimplência e resultado líquido
- Comparação com o período anterior e evolução dos últimos 12 meses
- Registro de pagamentos (Pix, cartão, dinheiro, transferência) e despesas
- Ranking de clientes e exportação CSV pronta para o Excel

## Tecnologias

- **React 19** + **TypeScript**
- **Vite**
- **Tailwind CSS 4**

## Arquitetura

Todas as chamadas à API passam por uma única função em `src/api.ts`. No modo demonstração, ela é desviada para `src/demo.ts`, um backend simulado que implementa as mesmas rotas e regras da [API real](https://github.com/araujohjessica/agenda-api), com dados gerados a partir da data atual. As telas não sabem se estão falando com o servidor ou com o simulador.

## Como executar

```bash
git clone https://github.com/araujohjessica/agenda.git
cd agenda
npm install
npm run dev
```

Com a API real rodando:

```bash
VITE_DEMO=false VITE_API_URL=http://localhost:4100/api npm run dev
```

## Autora

**Jessica Helena Araujo**, engenheira da computação, JA Developers · [GitHub](https://github.com/araujohjessica) · [LinkedIn](https://www.linkedin.com/in/jessica-araujo-89b328279/)