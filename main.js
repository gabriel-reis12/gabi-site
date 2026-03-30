document.addEventListener('DOMContentLoaded', () => {
    // ─── Particle System ─────────────────────────────────────────────────────
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = document.body.scrollHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const PARTICLE_COUNT = 120;
    const particles = [];

    const GOLD = [
        'rgba(207,174,139,',
        'rgba(230,200,160,',
        'rgba(180,145,105,',
        'rgba(255,220,170,',
    ];

    function rand(min, max) { return Math.random() * (max - min) + min; }

    class Particle {
        constructor() { this.reset(true); }
        reset(initial = false) {
            this.x      = rand(0, canvas.width);
            this.y      = initial ? rand(0, canvas.height) : rand(0, canvas.height);
            this.r      = rand(0.4, 2.2);
            this.speed  = rand(0.1, 0.4);
            this.color  = GOLD[Math.floor(Math.random() * GOLD.length)];
            this.alpha  = rand(0.2, 0.9);
            this.alphaD = rand(0.002, 0.008) * (Math.random() > 0.5 ? 1 : -1);
            this.angle  = rand(0, Math.PI * 2);
            this.angleD = rand(-0.01, 0.01);
        }
        update() {
            this.angle  += this.angleD;
            this.x      += Math.cos(this.angle) * this.speed;
            this.y      -= this.speed * 0.5;
            this.alpha  += this.alphaD;
            if (this.alpha <= 0.1 || this.alpha >= 0.95) this.alphaD *= -1;
            if (this.y < -5) { this.y = canvas.height + 5; this.x = rand(0, canvas.width); }
        }
        draw() {
            ctx.save();
            ctx.beginPath();
            // tiny glow halo
            const grd = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 4);
            grd.addColorStop(0,   this.color + this.alpha + ')');
            grd.addColorStop(0.5, this.color + (this.alpha * 0.3) + ')');
            grd.addColorStop(1,   this.color + '0)');
            ctx.fillStyle = grd;
            ctx.arc(this.x, this.y, this.r * 4, 0, Math.PI * 2);
            ctx.fill();
            // core dot
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = this.color + this.alpha + ')';
            ctx.fill();
            ctx.restore();
        }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());

    function loop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(loop);
    }
    loop();
    // ─────────────────────────────────────────────────────────────────────────

    // Inicialização das animações com Intersection Observer
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, self) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Adiciona a classe 'show' para iniciar as animações CSS mapeadas
                entry.target.classList.add('show');
                
                // Desconecta se você quiser que a animação aconteça apenas 1x
                // self.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Seleciona todos os elementos com a classe hidden
    const hiddenElements = document.querySelectorAll('.hidden');
    hiddenElements.forEach(el => observer.observe(el));
    
    // Efeito para a navbar ganhar fundo sólido ao dar scrollDown
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if(window.scrollY > 50) {
            navbar.style.background = 'rgba(9, 7, 6, 0.9)';
            navbar.style.boxShadow = '0 5px 20px rgba(0,0,0,0.5)';
            navbar.style.borderBottom = '1px solid rgba(214, 180, 144, 0.05)';
        } else {
            navbar.style.background = 'linear-gradient(to bottom, rgba(9, 7, 6, 0.9) 0%, rgba(9, 7, 6, 0) 100%)';
            navbar.style.boxShadow = 'none';
            navbar.style.borderBottom = 'none';
        }
    });
    
    // Efeitos dinâmicos do cursor em botões (brilho seguindo o mouse - simulação leve)
    const glassPanels = document.querySelectorAll('.glass-panel');
    glassPanels.forEach(panel => {
        panel.addEventListener('mousemove', e => {
            const rect = panel.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            panel.style.setProperty('--mouse-x', `${x}px`);
            panel.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // ─── Slider de Setas (Formação & Experiência) ─────────────────────────────
    function createSlider(trackId, prevId, nextId, counterId) {
        const track   = document.getElementById(trackId);
        const prevBtn = document.getElementById(prevId);
        const nextBtn = document.getElementById(nextId);
        const counter = document.getElementById(counterId);
        if (!track) return;

        const cards = Array.from(track.querySelectorAll('.slide-card'));
        let current = 0;

        function updateCounter() {
            const pad = n => String(n).padStart(2, '0');
            counter.textContent = `${pad(current + 1)} / ${pad(cards.length)}`;
        }

        function goTo(index, direction) {
            const prev = cards[current];
            current = (index + cards.length) % cards.length;
            const next = cards[current];

            // Animate out
            prev.classList.remove('active');
            prev.classList.add(direction === 'next' ? 'exit-left' : 'enter-right');

            // Setup incoming card
            next.style.transition = 'none';
            next.classList.remove('active', 'exit-left', 'enter-right');
            next.classList.add(direction === 'next' ? 'enter-right' : 'exit-left');

            // Force reflow
            next.getBoundingClientRect();
            next.style.transition = '';

            // Animate in
            requestAnimationFrame(() => {
                next.classList.remove('exit-left', 'enter-right');
                next.classList.add('active');
            });

            // Cleanup exit class after transition
            setTimeout(() => {
                prev.classList.remove('exit-left', 'enter-right');
            }, 500);

            prevBtn.disabled = current === 0;
            nextBtn.disabled = current === cards.length - 1;
            updateCounter();
        }

        prevBtn.addEventListener('click', () => goTo(current - 1, 'prev'));
        nextBtn.addEventListener('click', () => goTo(current + 1, 'next'));

        prevBtn.disabled = true;
        updateCounter();
    }

    createSlider('form-track', 'form-prev', 'form-next', 'form-counter');
    createSlider('exp-track',  'exp-prev',  'exp-next',  'exp-counter');
    // ─────────────────────────────────────────────────────────────────────────

    // ─── Interatividade da Seção "Não é Normal" ────────────────────────────────
    const symptomItems = document.querySelectorAll('.symptom-item');
    const symptomMsg = document.getElementById('symptom-dynamic-text');

    if (symptomItems.length > 0 && symptomMsg) {
        symptomItems.forEach(item => {
            item.addEventListener('click', () => {
                // Omitir ação se já estiver ativo
                if (item.classList.contains('active')) return;

                // Remover classe active de todos
                symptomItems.forEach(el => el.classList.remove('active'));
                
                // Adicionar active no item clicado
                item.classList.add('active');

                // Desvanecer o texto atual
                symptomMsg.classList.add('is-fading');
                
                // Aguardar a transição do CSS e mudar o texto
                setTimeout(() => {
                    symptomMsg.textContent = item.getAttribute('data-message');
                    symptomMsg.classList.remove('is-fading');
                }, 300);
            });
        });
    }

});
