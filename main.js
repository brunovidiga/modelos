import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

class HeroSlider {
    constructor() {
        this.container = document.getElementById('container');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.z = 5;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.loader = new THREE.TextureLoader();
        this.clock = new THREE.Clock();
        this.mouse = new THREE.Vector2(0, 0);
        this.targetMouse = new THREE.Vector2(0, 0);
        this.reveal = 0;
        this.clickReveal = 0;

        this.currentSlide = 0;
        this.totalSlides = 4;
        this.isTransitioning = false;

        this.slides = [
            { model: '/v2/woman2.jpg', animal: '/v2/tiger2.jpg', depthModel: '/v2/woman2_depth.jpg', depthAnimal: '/v2/tiger_depth.jpg' },
            { model: '/v3/woman3.jpg', animal: '/v3/snow.jpg', depthModel: '/v3/woman3_depth.webp', depthAnimal: '/v3/snow_depth.webp' },
            { model: '/v4/woman4.webp', animal: '/v4/leoa.webp', depthModel: '/v4/woman4_depth.webp', depthAnimal: '/v4/leoa_depth.webp' },
            { model: '/woman.jpg', animal: '/panther.jpg', depthModel: '/woman_depth.jpg', depthAnimal: '/panther_depth.jpg' }
        ];

        this.names = ['OUTONO', 'INVERNO', 'PRIMAVERA', 'VERÃO'];

        this.init();
    }

    loadTexture(url) {
        return new Promise((resolve) => {
            this.loader.load(url, (texture) => resolve(texture));
        });
    }

    async init() {
        this.textures = [];
        this.slidesLoaded = 1;

        // Load only the first slide → renders immediately
        const [m0, a0, d0, da0] = await Promise.all([
            this.loadTexture(this.slides[0].model),
            this.loadTexture(this.slides[0].animal),
            this.loadTexture(this.slides[0].depthModel),
            this.loadTexture(this.slides[0].depthAnimal)
        ]);
        this.textures[0] = { model: m0, animal: a0, depthModel: d0, depthAnimal: da0 };

        const img = m0.image;
        this.imgAspect = img.width / img.height;

        const geometry = new THREE.PlaneGeometry(1, 1, 64, 64);

        // Use first slide textures as placeholder for "next" too
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture1: { value: m0 },
                uTexture2: { value: a0 },
                uDepth1: { value: d0 },
                uDepth2: { value: da0 },
                uTexture1Next: { value: m0 },
                uTexture2Next: { value: a0 },
                uDepth1Next: { value: d0 },
                uDepth2Next: { value: da0 },
                uMouse: { value: new THREE.Vector2(0, 0) },
                uTime: { value: 0.0 },
                uReveal: { value: 0.0 },
                uClickReveal: { value: 0.0 },
                uTransition: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture1;
                uniform sampler2D uTexture2;
                uniform sampler2D uDepth1;
                uniform sampler2D uDepth2;
                uniform sampler2D uTexture1Next;
                uniform sampler2D uTexture2Next;
                uniform sampler2D uDepth1Next;
                uniform sampler2D uDepth2Next;
                uniform vec2 uMouse;
                uniform float uTime;
                uniform float uReveal;
                uniform float uClickReveal;
                uniform float uTransition;
                varying vec2 vUv;

                void main() {
                    float depth1 = texture2D(uDepth1, vUv).r;
                    float depth2 = texture2D(uDepth2, vUv).r;
                    vec2 displacement1 = uMouse * depth1 * 0.015;
                    vec2 displacement2 = uMouse * depth2 * 0.03;
                    vec2 uv1 = vUv + displacement1;
                    vec2 uv2 = vUv + displacement2;
                    vec4 color1 = texture2D(uTexture1, uv1);
                    vec4 color2 = texture2D(uTexture2, uv2);

                    float nextDepth1 = texture2D(uDepth1Next, vUv).r;
                    float nextDepth2 = texture2D(uDepth2Next, vUv).r;
                    vec2 nextDisplacement1 = uMouse * nextDepth1 * 0.015;
                    vec2 nextDisplacement2 = uMouse * nextDepth2 * 0.03;
                    vec2 nextUv1 = vUv + nextDisplacement1;
                    vec2 nextUv2 = vUv + nextDisplacement2;
                    vec4 nextColor1 = texture2D(uTexture1Next, nextUv1);
                    vec4 nextColor2 = texture2D(uTexture2Next, nextUv2);

                    vec2 mouseUv = uMouse + 0.5;
                    float dist = distance(vUv, mouseUv);
                    float ripple = sin(vUv.x * 15.0 + uTime) * cos(vUv.y * 15.0 + uTime * 0.5) * 0.015 * uReveal;
                    float maskRadius = (0.08 * uReveal) + (uClickReveal * 1.5) + ripple;
                    float maskBlur = 0.08 + (uClickReveal * 0.2);
                    float mask = (1.0 - smoothstep(maskRadius, maskRadius + maskBlur, dist)) * max(uReveal, uClickReveal);

                    vec4 currentMix = mix(color1, color2, mask);
                    vec4 nextMix = mix(nextColor1, nextColor2, mask);

                    gl_FragColor = mix(currentMix, nextMix, uTransition);
                }
            `
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.scene.add(this.mesh);

        this.updateScale();
        this.setupEvents();
        this.setupNavigation();
        this.animate();

        // Load remaining slides in background
        this.loadRemainingSlides();
    }

    async loadRemainingSlides() {
        const promises = [];
        for (let i = 1; i < this.slides.length; i++) {
            const s = this.slides[i];
            promises.push(
                Promise.all([
                    this.loadTexture(s.model),
                    this.loadTexture(s.animal),
                    this.loadTexture(s.depthModel),
                    this.loadTexture(s.depthAnimal)
                ]).then(([model, animal, depthModel, depthAnimal]) => {
                    this.textures[i] = { model, animal, depthModel, depthAnimal };
                    this.slidesLoaded = i + 1;
                })
            );
        }
        await Promise.all(promises);
        this.refreshNextTextures();
    }

    refreshNextTextures() {
        const next = (this.currentSlide + 1) % this.totalSlides;
        if (this.textures[next]) {
            this.material.uniforms.uTexture1Next.value = this.textures[next].model;
            this.material.uniforms.uTexture2Next.value = this.textures[next].animal;
            this.material.uniforms.uDepth1Next.value = this.textures[next].depthModel;
            this.material.uniforms.uDepth2Next.value = this.textures[next].depthAnimal;
        }
    }

    setupNavigation() {
        this.prevBtn = document.querySelector('.nav-arrow.prev');
        this.nextBtn = document.querySelector('.nav-arrow.next');
        this.dots = document.querySelectorAll('.nav-dot');
        this.nameEl = document.querySelector('.slide-name');
        this.numberEl = document.querySelector('.slide-number');

        this.prevBtn.addEventListener('click', () => this.goToSlide(this.currentSlide - 1));
        this.nextBtn.addEventListener('click', () => this.goToSlide(this.currentSlide + 1));

        this.dots.forEach((dot) => {
            dot.addEventListener('click', () => this.goToSlide(parseInt(dot.dataset.index)));
        });

        this.updateUI();
    }

    async goToSlide(index) {
        if (this.isTransitioning || index === this.currentSlide) return;
        if (index < 0 || index >= this.totalSlides) return;
        if (!this.textures[index]) return;

        this.isTransitioning = true;
        const prevIndex = this.currentSlide;

        this.material.uniforms.uTexture1Next.value = this.textures[index].model;
        this.material.uniforms.uTexture2Next.value = this.textures[index].animal;
        this.material.uniforms.uDepth1Next.value = this.textures[index].depthModel;
        this.material.uniforms.uDepth2Next.value = this.textures[index].depthAnimal;

        this.material.uniforms.uTransition.value = 0;

        const tl = gsap.timeline({
            onComplete: () => {
                this.material.uniforms.uTexture1.value = this.textures[index].model;
                this.material.uniforms.uTexture2.value = this.textures[index].animal;
                this.material.uniforms.uDepth1.value = this.textures[index].depthModel;
                this.material.uniforms.uDepth2.value = this.textures[index].depthAnimal;
                this.material.uniforms.uTransition.value = 0;

                this.currentSlide = index;
                this.updateUI();
                this.isHovered = false;
                this.isTransitioning = false;
                this.refreshNextTextures();
            }
        });

        tl.to(this, { reveal: 0, clickReveal: 0, duration: 0.5, ease: 'power2.out' });
        tl.to(this.material.uniforms.uTransition, { value: 1, duration: 1.0, ease: 'power3.inOut' }, '-=0.1');
    }

    updateUI() {
        this.dots.forEach((dot) => dot.classList.remove('active'));
        this.dots[this.currentSlide].classList.add('active');
        this.nameEl.textContent = this.names[this.currentSlide];
        this.numberEl.textContent = String(this.currentSlide + 1).padStart(2, '0');
    }

    setupEvents() {
        this.isHovered = false;
        let touchStartX = 0;
        let touchStartY = 0;

        window.addEventListener('pointermove', (e) => {
            this.targetMouse.x = (e.clientX / window.innerWidth) - 0.5;
            this.targetMouse.y = -(e.clientY / window.innerHeight) + 0.5;

            if (e.pointerType === 'mouse' && !this.isHovered) {
                this.isHovered = true;
                gsap.to(this, {
                    reveal: 1,
                    duration: 1.2,
                    ease: 'power2.out',
                    overwrite: 'auto'
                });
            }
        });

        document.addEventListener('pointerleave', (e) => {
            if (e.pointerType === 'mouse') {
                this.isHovered = false;
                gsap.to(this, {
                    reveal: 0,
                    clickReveal: 0,
                    duration: 1.2,
                    ease: 'power2.out',
                    overwrite: 'auto'
                });
            }
        });

        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                gsap.to(this, {
                    clickReveal: 1,
                    duration: 1.5,
                    ease: 'power3.out',
                    overwrite: 'auto'
                });
            }
        });

        window.addEventListener('mouseup', () => {
            gsap.to(this, {
                clickReveal: 0,
                duration: 1.2,
                ease: 'power2.out',
                overwrite: 'auto'
            });
        });

        window.addEventListener('touchstart', (e) => {
            this.isHovered = false;
            if (e.touches && e.touches.length > 0) {
                this.targetMouse.x = (e.touches[0].clientX / window.innerWidth) - 0.5;
                this.targetMouse.y = -(e.touches[0].clientY / window.innerHeight) + 0.5;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
            gsap.to(this, { reveal: 1, duration: 1.2, ease: 'power2.out', overwrite: 'auto' });

            clearTimeout(this.touchTimeout);
            this.touchTimeout = setTimeout(() => {
                gsap.to(this, { clickReveal: 1, duration: 1.5, ease: 'power3.out', overwrite: 'auto' });
            }, 350);
        });

        window.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length > 0) {
                this.targetMouse.x = (e.touches[0].clientX / window.innerWidth) - 0.5;
                this.targetMouse.y = -(e.touches[0].clientY / window.innerHeight) + 0.5;

                const dx = e.touches[0].clientX - touchStartX;
                const dy = e.touches[0].clientY - touchStartY;
                if (Math.sqrt(dx * dx + dy * dy) > 15) {
                    clearTimeout(this.touchTimeout);
                }
            }
        });

        window.addEventListener('touchend', () => {
            clearTimeout(this.touchTimeout);
            gsap.to(this, {
                reveal: 0,
                clickReveal: 0,
                duration: 1.2,
                ease: 'power2.out',
                overwrite: 'auto'
            });
        });

        window.addEventListener('resize', () => {
            this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            this.updateScale();
        });
    }

    updateScale() {
        const screenAspect = this.container.clientWidth / this.container.clientHeight;
        const fov = this.camera.fov * (Math.PI / 180);
        const visibleHeight = 2 * Math.tan(fov / 2) * this.camera.position.z;
        const visibleWidth = visibleHeight * screenAspect;

        let scaleX = visibleWidth;
        let scaleY = visibleHeight;

        if (screenAspect > this.imgAspect) {
            scaleY = visibleWidth / this.imgAspect;
        } else {
            scaleX = visibleHeight * this.imgAspect;
        }

        scaleX *= 1.15;
        scaleY *= 1.15;

        this.mesh.scale.set(scaleX, scaleY, 1);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.05;
        this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.05;

        if (this.material) {
            this.material.uniforms.uMouse.value.set(this.mouse.x, this.mouse.y);
            this.material.uniforms.uTime.value = this.clock.getElapsedTime();
            this.material.uniforms.uReveal.value = this.reveal;
            this.material.uniforms.uClickReveal.value = this.clickReveal;
        }

        this.renderer.render(this.scene, this.camera);
    }
}

new HeroSlider();

/* ── Selected forms (horizontal carousel) ── */
const productStory = document.getElementById('productStory');
const productTrack = document.getElementById('productTrack');
const productSlides = gsap.utils.toArray('.product-slide');
const productProgress = document.getElementById('productProgress');

if (productStory && productTrack && productSlides.length) {
  const horizontalTween = gsap.to(productTrack, {
    x: () => -(productTrack.scrollWidth - window.innerWidth),
    ease: 'none',
    scrollTrigger: {
      trigger: productStory,
      start: 'top top',
      end: () => `+=${productTrack.scrollWidth - window.innerWidth}`,
      pin: true,
      scrub: 1.15,
      invalidateOnRefresh: true,
      anticipatePin: 1,
      onUpdate(self) {
        productProgress && gsap.set(productProgress, { scaleX: self.progress });
      }
    }
  });

  productSlides.forEach((slide) => {
    const image = slide.querySelector('.product-image');
    const elements = slide.querySelectorAll(
      '.product-meta, .product-title, .product-copy, .product-action'
    );

    gsap.fromTo(
      image,
      { xPercent: -6, scale: 1.1 },
      {
        xPercent: 6,
        scale: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: slide,
          containerAnimation: horizontalTween,
          start: 'left right',
          end: 'right left',
          scrub: 1.2
        }
      }
    );

    gsap.fromTo(
      elements,
      { y: 54, opacity: 0, filter: 'blur(0.7rem)' },
      {
        y: 0,
        opacity: 1,
        filter: 'blur(0rem)',
        stagger: 0.1,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: slide,
          containerAnimation: horizontalTween,
          start: 'left 72%',
          toggleActions: 'play none none reverse'
        }
      }
    );
  });
}

/* ── Guarda-Roupa de Assinatura ── */
const wardrobeCanvas = document.getElementById('wardrobeCanvas');
if (wardrobeCanvas) {
  const ctx = wardrobeCanvas.getContext('2d');
  const drawSmoke = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = wardrobeCanvas.getBoundingClientRect();
    wardrobeCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
    wardrobeCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.fillStyle = '#050504';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 48; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = Math.random() * Math.min(w, h) * 0.22 + Math.min(w, h) * 0.08;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const hue = Math.random() > 0.68 ? '58,70,83' : '205,205,198';
      g.addColorStop(0, `rgba(${hue},${Math.random() * 0.14 + 0.04})`);
      g.addColorStop(0.45, `rgba(${hue},${Math.random() * 0.055 + 0.02})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const imgData = ctx.getImageData(0, 0, wardrobeCanvas.width, wardrobeCanvas.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      imgData.data[i] += n;
      imgData.data[i + 1] += n;
      imgData.data[i + 2] += n;
      imgData.data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  };

  drawSmoke();
  window.addEventListener('resize', drawSmoke);
}

const wardrobeSection = document.querySelector('.wardrobe-section');
const wardrobeSculpture = document.querySelector('.wardrobe-sculpture');
const wardrobeHeadline = document.querySelector('.wardrobe-headline');
const wardrobeCards = document.querySelector('.wardrobe-cards');
const wardrobeBottomBar = document.querySelector('.wardrobe-bottombar');

if (wardrobeSection && wardrobeSculpture && wardrobeHeadline && wardrobeCards && wardrobeBottomBar) {
  const ctx = gsap.context(() => {
    const mainTl = gsap.timeline({
      scrollTrigger: {
        trigger: wardrobeSection,
        start: 'top top',
        end: '+=2800',
        scrub: true,
        pin: true
      }
    });

    mainTl.fromTo(
      wardrobeSculpture,
      { y: -80, scale: 0.72, rotate: -2, opacity: 0.92 },
      { y: -8, scale: 1.02, rotate: 0, opacity: 1, duration: 0.38, ease: 'none' },
      0
    );

    mainTl.to(
      wardrobeHeadline,
      { opacity: 0, filter: 'blur(1rem)', scale: 0.96, duration: 0.24, ease: 'none' },
      0.34
    );

    mainTl.to(
      wardrobeSculpture,
      { y: 8, scale: 1.16, duration: 0.36, ease: 'none' },
      0.48
    );

    mainTl.to(
      wardrobeCards,
      { opacity: 1, duration: 0.12, ease: 'none' },
      0.56
    );

    const cards = gsap.utils.toArray('.service-card');
    gsap.set(cards, { y: 34, filter: 'blur(8px)', opacity: 0 });

    mainTl.to(
      cards,
      { opacity: 1, y: 0, filter: 'blur(0px)', stagger: 0.055, duration: 0.26, ease: 'none' },
      0.62
    );

    mainTl.fromTo(
      wardrobeBottomBar,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.2, ease: 'none' },
      0.7
    );
  }, wardrobeSection);
}

/* ── Store (Best Apparel) ── */
const storeSection = document.querySelector('.store-section');
if (storeSection) {
  gsap.utils.toArray('.store-section .reveal').forEach((el) => {
    gsap.from(el, {
      y: 50,
      opacity: 0,
      filter: 'blur(10px)',
      duration: 1,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' }
    });
  });

  gsap.utils.toArray('.store-card').forEach((card, i) => {
    gsap.from(card, {
      y: 60,
      opacity: 0,
      filter: 'blur(6px)',
      duration: 0.9,
      ease: 'power3.out',
      delay: (i % 4) * 0.08,
      scrollTrigger: { trigger: card, start: 'top 92%' }
    });
  });

  document.querySelectorAll('.store-wish').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      gsap.fromTo(btn, { scale: 0.7 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
      btn.classList.toggle('active');
    });
  });
}
