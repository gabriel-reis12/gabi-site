# Gabriela Sarra

Site institucional estático em HTML, CSS e JavaScript, com o conceito **The Inner Journey**. Não requer instalação de dependências nem compilação.

## Preview local

Com Node.js 22 ou superior:

```sh
node execution/serve.mjs
```

Acesse `http://127.0.0.1:4173`. Encerre com Ctrl+C. Use HTTP para carregar os módulos JavaScript; ao abrir diretamente por `file://`, o conteúdo e os links permanecem disponíveis, mas o navegador pode bloquear os módulos.

## Verificações

```sh
node execution/check.mjs
node --test execution/journey-scene.test.mjs execution/navigation.test.mjs
git diff --check
```

O primeiro comando verifica estrutura HTML, referências locais, âncoras, conteúdo profissional preservado, contatos, contraste dos tokens, regras CSS e sintaxe JavaScript. Os testes verificam o controlador da navegação e o ciclo de vida da futura cena. São verificações estáticas e de comportamento com doubles de DOM; não substituem testes no navegador.

## Organização

- `index.html`: todo o conteúdo e controles nativos, disponíveis sem JavaScript.
- `styles.css`: tokens, componentes, responsividade e movimento reduzido.
- `main.js`: menu e revelações discretas.
- `components/journey-scene.js`: integração opcional da futura cena; não carrega frames nesta versão.
- `Imagens/optimized/`: versões de 480 e 960 px das fotografias existentes. Os originais foram preservados.
- `directives/redesign.md`: auditoria, decisões, contrato da cena e resultados de validação.
- `directives/professional-content.json`: referência dos nove registros profissionais extraídos do site original.

As fontes usam Google Fonts com `display=swap` e fallbacks locais. A fonte remota pode ser bloqueada sem impedir o acesso ao conteúdo. Não há analytics, formulário, backend ou dependências de runtime adicionadas.

Nenhum deploy foi realizado.
