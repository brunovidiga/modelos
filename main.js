import * as THREE from 'three';
import gsap from 'gsap';

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

        for (const slide of this.slides) {
            const [model, animal, depthModel, depthAnimal] = await Promise.all([
                this.loadTexture(slide.model),
                this.loadTexture(slide.animal),
                this.loadTexture(slide.depthModel),
                this.loadTexture(slide.depthAnimal)
            ]);
            this.textures.push({ model, animal, depthModel, depthAnimal });
        }

        const img = this.textures[0].model.image;
        this.imgAspect = img.width / img.height;

        const geometry = new THREE.PlaneGeometry(1, 1, 64, 64);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture1: { value: this.textures[0].model },
                uTexture2: { value: this.textures[0].animal },
                uDepth1: { value: this.textures[0].depthModel },
                uDepth2: { value: this.textures[0].depthAnimal },
                uTexture1Next: { value: this.textures[1].model },
                uTexture2Next: { value: this.textures[1].animal },
                uDepth1Next: { value: this.textures[1].depthModel },
                uDepth2Next: { value: this.textures[1].depthAnimal },
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
