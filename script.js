const canvas = document.getElementById('hero-canvas');
const context = canvas?.getContext('2d');

if (canvas && context) {
  const frameCount = 64;
  const fullCircle = Math.PI * 2;
  const responseFactor = 0.26;
  const deadzoneRatio = 0.12;
  // Kaynak karelerde 08=yukarı, 24=sağ, 40=aşağı, 56=sol.
  const frameOffset = 24;
  // Sol üstteki kaynak pozlar 60'lı karelerde; 00-02 ise düz bakış.
  const upperLeftAngle = -3 * Math.PI / 4;
  const upperLeftWidth = Math.PI / 4;
  const upperLeftFrameBias = 4;

  // Tüm karelerin indirilmesini sayfa açılır açılmaz başlat.
  const centerImage = new Image();
  centerImage.src = 'public/frames/center.webp';
  const rotationFrames = Array.from({ length: frameCount }, (_, index) => {
    const image = new Image();
    image.src = `public/frames/frame-${String(index).padStart(3, '0')}.webp`;
    return image;
  });

  const pointer = { x: 0, y: 0, active: false };
  let smoothedAngle = null;

  window.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }, { passive: true });
  window.addEventListener('blur', () => { pointer.active = false; });

  function drawImageCover(image) {
    const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - cropSize) / 2;
    const sourceY = (image.naturalHeight - cropSize) / 2;
    context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
  }

  function animatePortrait() {
    let selectedImage = centerImage;

    if (pointer.active) {
      const bounds = canvas.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const dx = pointer.x - centerX;
      const dy = pointer.y - centerY;
      const deadzone = Math.min(bounds.width, bounds.height) * 0.5 * deadzoneRatio;
      const distanceToCenter = Math.hypot(dx, dy);

      if (distanceToCenter > deadzone) {
        const targetAngle = Math.atan2(dy, dx);
        if (smoothedAngle === null) smoothedAngle = targetAngle;

        // En kısa dairesel mesafeyi kullan; 359° → 0° geçişinde sıçrama olmaz.
        let delta = targetAngle - smoothedAngle;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        smoothedAngle += delta * responseFactor;

        const upperLeftDelta = Math.atan2(
          Math.sin(smoothedAngle - upperLeftAngle),
          Math.cos(smoothedAngle - upperLeftAngle)
        );
        const upperLeftBias = upperLeftFrameBias * Math.max(
          0,
          1 - Math.abs(upperLeftDelta) / upperLeftWidth
        );
        const rawIndex = smoothedAngle / fullCircle * frameCount + frameOffset - upperLeftBias;
        const frameIndex = Math.floor(((rawIndex % 64) + 64) % 64);
        // 00-02 kaynakta düz bakıyor; dış bölgede en yakın yukarı pozunu kullan.
        const imageIndex = frameIndex < 3 ? 3 : frameIndex;
        selectedImage = rotationFrames[imageIndex];
      } else {
        smoothedAngle = null;
      }
    } else {
      smoothedAngle = null;
    }

    // Önceki görüntüyü tamamen sil; hazır olan tek kareyi tam opaklıkta çiz.
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1;
    const imageToDraw = selectedImage.complete && selectedImage.naturalWidth > 0
      ? selectedImage
      : centerImage;
    if (imageToDraw.complete && imageToDraw.naturalWidth > 0) {
      drawImageCover(imageToDraw);
    }

    requestAnimationFrame(animatePortrait);
  }

  requestAnimationFrame(animatePortrait);
}

const animatedCards = document.querySelectorAll(
  '#deneyim .timeline-card, #projeler .project-card, #egitim .education-card, #beceriler .skill-card'
);
animatedCards.forEach((card) => card.classList.add('scroll-card'));
document.documentElement.classList.add('has-scroll-motion');
const revealItems = document.querySelectorAll('.reveal, .scroll-card');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px 35px 0px' });
  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const customCursor = document.getElementById('custom-cursor');
const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)');
if (customCursor && finePointer?.matches) {
  document.documentElement.classList.add('has-custom-cursor');
  const cursorResponse = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0.28;

  let targetX = 0;
  let targetY = 0;
  let cursorX = 0;
  let cursorY = 0;
  let cursorFrame = 0;
  let hasPosition = false;

  function moveCursor() {
    cursorX += (targetX - cursorX) * cursorResponse;
    cursorY += (targetY - cursorY) * cursorResponse;
    customCursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;

    if (Math.abs(targetX - cursorX) + Math.abs(targetY - cursorY) > 0.3) {
      cursorFrame = requestAnimationFrame(moveCursor);
    } else {
      cursorFrame = 0;
    }
  }

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;

    targetX = event.clientX;
    targetY = event.clientY;
    if (!hasPosition) {
      cursorX = targetX;
      cursorY = targetY;
      hasPosition = true;
    }
    customCursor.classList.add('is-visible');
    customCursor.classList.toggle(
      'is-hovering',
      Boolean(event.target.closest('a, button, [role="button"]'))
    );
    if (!cursorFrame) cursorFrame = requestAnimationFrame(moveCursor);
  }, { passive: true });

  document.addEventListener('pointerout', (event) => {
    if (!event.relatedTarget) customCursor.classList.remove('is-visible');
  });
  window.addEventListener('blur', () => customCursor.classList.remove('is-visible'));
}

document.getElementById('year').textContent = new Date().getFullYear();
