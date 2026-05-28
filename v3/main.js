import * as THREE from 'three';
import gsap from 'gsap';

class HeroEffect {
    constructor() {
        this.container = document.getElementById('container');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
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
        
        this.init();
    }

    async init() {
        // Textures loader
        const loadTexture = (url) => {
            return new Promise((resolve, reject) => {
                this.loader.load(url, (texture) => {
                    resolve(texture);
                }, undefined, (err) => {
                    console.error("Erro ao carregar a textura:", url, err);
                    resolve(null);
                });
            });
        };

        // Carregar as texturas principais primeiro para pegar a proporção
        const tex1 = await loadTexture('/v3/woman3.jpg');
        const tex2 = await loadTexture('/v3/snow.jpg');
        const depthTex1 = await loadTexture('/v3/woman3_depth.webp');
        const depthTex2 = await loadTexture('/v3/snow_depth.webp');
        
        // Calcular proporção baseada na primeira imagem
        const img = tex1.image;
        this.imgAspect = img.width / img.height;
        
        // Criar geometria 1x1 para podermos escalonar adequadamente e cobrir toda a tela
        const geometry = new THREE.PlaneGeometry(1, 1, 64, 64);
        
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture1: { value: tex1 },
                uTexture2: { value: tex2 },
                uDepth1: { value: depthTex1 },
                uDepth2: { value: depthTex2 },
                uMouse: { value: new THREE.Vector2(0, 0) },
                uTime: { value: 0.0 },
                uReveal: { value: 0.0 },
                uClickReveal: { value: 0.0 },
                uResolution: { value: new THREE.Vector4() }
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
                uniform vec2 uMouse;
                uniform float uTime;
                uniform float uReveal;
                uniform float uClickReveal;
                varying vec2 vUv;

                void main() {
                    // Sample depths
                    float depth1 = texture2D(uDepth1, vUv).r;
                    float depth2 = texture2D(uDepth2, vUv).r;
                    
                    // Parallax for each layer
                    vec2 displacement1 = uMouse * depth1 * 0.015;
                    vec2 displacement2 = uMouse * depth2 * 0.03;
                    
                    vec2 uv1 = vUv + displacement1;
                    vec2 uv2 = vUv + displacement2;
                    
                    // Sample colors
                    vec4 color1 = texture2D(uTexture1, uv1);
                    vec4 color2 = texture2D(uTexture2, uv2);

                    // Liquid Reveal Mask
                    vec2 mouseUv = uMouse + 0.5;
                    float dist = distance(vUv, mouseUv);
                    
                    // Liquid effect with time
                    float ripple = sin(vUv.x * 15.0 + uTime) * cos(vUv.y * 15.0 + uTime * 0.5) * 0.015 * uReveal;
                    float maskRadius = (0.08 * uReveal) + (uClickReveal * 1.5) + ripple;
                    float maskBlur = 0.08 + (uClickReveal * 0.2);
                    
                    float mask = (1.0 - smoothstep(maskRadius, maskRadius + maskBlur, dist)) * max(uReveal, uClickReveal);
                    
                    gl_FragColor = mix(color1, color2, mask);
                }
            `
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.scene.add(this.mesh);
        
        this.updateScale();
        this.setupEvents();
        this.animate();
    }

    setupEvents() {
        this.isHovered = false;
        let touchStartX = 0;
        let touchStartY = 0;

        // Track mouse/pointer position and trigger hover reveal on desktop
        window.addEventListener('pointermove', (e) => {
            this.targetMouse.x = (e.clientX / window.innerWidth) - 0.5;
            this.targetMouse.y = -(e.clientY / window.innerHeight) + 0.5;

            // On desktop mouse movement, if not already in hovered state, trigger reveal
            if (e.pointerType === 'mouse' && !this.isHovered) {
                this.isHovered = true;
                gsap.to(this, { 
                    reveal: 1, 
                    duration: 1.2, 
                    ease: "power2.out",
                    overwrite: "auto"
                });
            }
        });

        // Hide when mouse leaves the window
        document.addEventListener('pointerleave', (e) => {
            if (e.pointerType === 'mouse') {
                this.isHovered = false;
                gsap.to(this, { 
                    reveal: 0, 
                    clickReveal: 0,
                    duration: 1.2, 
                    ease: "power2.out",
                    overwrite: "auto"
                });
            }
        });

        // Desktop Click: Full Reveal
        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click
                gsap.to(this, { 
                    clickReveal: 1, 
                    duration: 1.5, 
                    ease: "power3.out", 
                    overwrite: "auto" 
                });
            }
        });

        window.addEventListener('mouseup', () => {
            gsap.to(this, { 
                clickReveal: 0, 
                duration: 1.2, 
                ease: "power2.out", 
                overwrite: "auto" 
            });
        });

        // Mobile/Touch: Reveal parts on touch/drag, full reveal on long press (holding the touch)
        window.addEventListener('touchstart', (e) => {
            this.isHovered = false; // Reset hover state on touch
            if (e.touches && e.touches.length > 0) {
                this.targetMouse.x = (e.touches[0].clientX / window.innerWidth) - 0.5;
                this.targetMouse.y = -(e.touches[0].clientY / window.innerHeight) + 0.5;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
            gsap.to(this, { reveal: 1, duration: 1.2, ease: "power2.out", overwrite: "auto" });

            // Start timer for mobile full reveal (long press / holding down)
            clearTimeout(this.touchTimeout);
            this.touchTimeout = setTimeout(() => {
                gsap.to(this, { clickReveal: 1, duration: 1.5, ease: "power3.out", overwrite: "auto" });
            }, 350); // 350ms holding down triggers full reveal
        });

        window.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length > 0) {
                this.targetMouse.x = (e.touches[0].clientX / window.innerWidth) - 0.5;
                this.targetMouse.y = -(e.touches[0].clientY / window.innerHeight) + 0.5;

                // If user drags/moves finger significantly, cancel the full-reveal timer (keep it a local lens reveal)
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
                 ease: "power2.out", 
                 overwrite: "auto" 
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
        
        // Base dimensions to cover the screen
        let scaleX = visibleWidth;
        let scaleY = visibleHeight;

        // Apply 'cover' logic
        if (screenAspect > this.imgAspect) {
            scaleY = visibleWidth / this.imgAspect;
        } else {
            scaleX = visibleHeight * this.imgAspect;
        }

        // Add extra margin for parallax movement without showing borders
        scaleX *= 1.15;
        scaleY *= 1.15;

        this.mesh.scale.set(scaleX, scaleY, 1);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        // Smooth lerping for the mouse
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

new HeroEffect();
