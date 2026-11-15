# Gabriela Sarra — The Inner Journey

## Auditoria anterior à implementação

- Site estático: `index.html`, `styles.css`, `main.js`. Sem framework, package.json, build, lint ou testes existentes. Nenhum AGENTS.md encontrado no projeto ou diretórios ancestrais consultados.
- Identidade: marrom quase preto, champagne, Playfair Display + Outfit. Font Awesome externo usado para ícones. Muitos painéis translúcidos e brilhos concorrentes.
- Problemas: canvas do tamanho do documento redesenhado continuamente, imagens PNG de aproximadamente 2,2 MB, animações infinitas, ausência de reduced-motion, textos ocultos quando JS falha, itens clicáveis sem teclado, menu mobile sem estado ARIA/Escape, breakpoint de navegação apenas em 430 px, slides ocultos ainda no conteúdo acessível.
- Fluxos: agendamento exclusivamente por `https://wa.me/5519993730000`; e-mail `gabysarra23@gmail.com`. Âncoras existentes: inicio, sobre, agendar, nao-normal, formacao, experiencia, depoimentos.
- Conteúdo profissional: neurodesenvolvimento; TEA e outras comorbidades; ABA; crianças, adolescentes e famílias; orientação parental e articulação escolar; atendimento exclusivamente online, sessões de 50 minutos. Preservar as quatro formações e cinco experiências, incluindo datas e instituições, sem presumir atualização de vínculos.
- CRP 06/215390 confirmado visualmente na própria `Imagens/Logo.png`. Não constava como texto no HTML.
- Recursos: logo e três retratos existentes; brain.jpg; 287 frames não rastreados em `Imagens/Imagens Intro/`. Preservar os originais e não carregar os frames nesta etapa.
- Depoimentos identificados apenas como Mãe 01–05/Paciente 01–02, sem documentação de autenticidade. Retirados da apresentação; não reaproveitados como prova social. Texto anterior segue recuperável no Git. Âncora antiga leva ao FAQ.
- A seção de sintomas trazia afirmações clínicas generalizantes. Substituída por um convite acolhedor sem diagnóstico, mantendo sua âncora e sem criar novos serviços.

## Direção e estrutura

Espresso #100C0A, chocolate #33231C, bronze #9D7556, champagne #D5B594 e marfim #F1E8DF. Bronze para elementos gráficos; textos usam combinações de maior contraste. Cormorant Garamond para títulos, Manrope para leitura. Composição editorial assimétrica, fotografia existente, margens generosas, linhas discretas e alternância claro/escuro.

Hero → apresentação → abordagem → áreas de atendimento → processo → formação/experiência → FAQ → agendamento → rodapé. Sem depoimentos, alegações de resultado, urgência artificial ou novos serviços.

Aplicadas as orientações das skills Sites e UI/UX local: conteúdo sem dependência de JS, navegação por teclado, foco visível, alvos de toque, tipografia legível, movimento reduzido e ausência de scroll hijacking. O Python disponível no PATH era um alias inacessível; as referências CSV da skill local foram consultadas diretamente.

## Módulo cinematográfico futuro

`components/journey-scene.js` é o ponto isolado de integração. A composição fotográfica estática está no HTML e funciona mesmo sem JavaScript. Nenhum vídeo, frame, canvas ou GSAP é carregado agora.

A futura implementação deve fornecer `loadExperience({ mount, signal, bounds })`, resolver para um controlador com `destroy()`, e só resolver após o primeiro frame estar pronto. `bounds` fornece as dimensões do espaço reservado enquanto o host está oculto. O componente carrega perto da viewport, mantém o fallback em caso de erro e não ativa em mobile, economia de dados ou reduced-motion. Desmonta ao mudar essas preferências. A sequência A → B → C, seleção de resoluções, atualização das dimensões, limite de memória e liberação de frames pertencem ao futuro renderer. Não colocar textos/CTAs dentro do canvas nem prender o scroll natural.

## Execução local

`node execution/serve.mjs` inicia o preview em http://127.0.0.1:4173.
`node execution/check.mjs` valida estrutura, referências, conteúdo profissional, contatos, sintaxe, CSS e contraste.
`node --test execution/journey-scene.test.mjs execution/navigation.test.mjs` verifica carregamento opcional, fallback, desmontagem e estados da navegação.

Projeto sem etapa de compilação: o HTML, CSS, JavaScript e assets constituem a entrega. Nenhum deploy autorizado ou realizado.

## Resultado das verificações

- Verificação estática passou: 23 IDs únicos, âncoras e referências ARIA válidas, sete caminhos locais de assets, conteúdo dos nove registros profissionais, WhatsApp, e-mail e CRP.
- Estrutura das tags HTML, balanceamento das regras CSS, referências a tokens e sintaxe dos módulos JavaScript passaram. Não havia compilador ou linter configurado no projeto; foi acrescentado um verificador leve, sem dependências.
- 16 testes passaram: estados do menu, Escape, foco ao navegar, fechamento externo, transições de breakpoint, fallback sem loader, reduced-motion, mobile, economia de dados, erro, cancelamento, concorrência e desmontagem do renderer.
- Oito combinações de cores para texto/CTA foram calculadas: contraste mínimo de 4,67:1. O acento sobre o fundo bege foi escurecido para #765239 após a primeira verificação. O teste não mede pixels sobre fotografia nem substitui uma auditoria de acessibilidade no navegador.
- Smoke HTTP passou: página, CSS, módulos, fotos e logo retornaram 200 com MIME correto. Caminhos privados do checkout não são expostos pelo servidor local.
- Duas fotografias: originais somam 4.505.846 bytes; as versões de 960 px somam 284.654 bytes, uma redução de 93,7%. As variantes de 480 px somam 96.295 bytes. Os arquivos originais permanecem intactos.
- Revisão visual em 375, 768, 1024 e 1440 px, console do navegador e Core Web Vitals **não executados**: Computer Use informou `The browser access host is unavailable` e pipe nativo indisponível em duas tentativas. Responsividade foi implementada e revisada no código; não há alegação de validação visual ou Lighthouse.
- Nenhuma biblioteca de animação, imagem gerada, vídeo ou frame carregado. A pasta de frames que já estava não rastreada permanece intocada.

Para a próxima revisão com navegador disponível: verificar os quatro breakpoints, reflow a 320 px/zoom 200%, menu com Tab/Escape, FAQ com Enter/Espaço, todos os destinos de agendamento, preferências de movimento reduzido e bloqueio de fontes/JavaScript.
