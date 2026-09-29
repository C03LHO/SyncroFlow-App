/* ═══ SyncroFlow — js/ui/image-crop.js
   Editor de recorte de imagem (zoom + arrastar). Abre um overlay
   próprio (não fecha o modal de baixo), deixa o usuário enquadrar a
   imagem e devolve um Blob já cortado nas dimensões de saída. */
import { escapeHTML } from '../core/dom.js';

/**
 * @param {File} file        arquivo escolhido
 * @param {number} aspect    proporção do quadro (ex.: 1 = quadrado, 4 = capa 4:1)
 * @param {number} outW      largura de saída (px)
 * @param {number} outH      altura de saída (px)
 * @param {string} title     título do diálogo
 * @param {boolean} round    moldura redonda (avatar)
 * @returns {Promise<Blob|null>}
 */
export function openImageCrop({ file, aspect = 1, outW = 400, outH = 400, title = 'Ajustar imagem', round = false }) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    // dimensões do quadro de pré-visualização
    const frameW = aspect >= 2 ? 360 : 280;
    const frameH = Math.round(frameW / aspect);

    const back = document.createElement('div');
    back.className = 'crop-backdrop';
    back.innerHTML = `
      <div class="crop-dialog" role="dialog" aria-modal="true">
        <div class="crop-head">
          <span class="crop-title">${escapeHTML(title)}</span>
          <span class="crop-dim">Saída: ${outW}×${outH}px</span>
        </div>
        <div class="crop-stage" style="width:${frameW}px;height:${frameH}px;">
          <div class="crop-frame ${round ? 'is-round' : ''}" style="width:${frameW}px;height:${frameH}px;">
            <img class="crop-img" alt="" draggable="false">
            <div class="crop-shade"></div>
          </div>
        </div>
        <div class="crop-zoom">
          <span>−</span>
          <input type="range" id="crop-zoom" min="1" max="3" step="0.01" value="1">
          <span>+</span>
        </div>
        <p class="crop-hint">Arraste para posicionar e use o controle para dar zoom.</p>
        <div class="crop-actions">
          <button class="btn btn-secondary" data-act="cancel">Cancelar</button>
          <button class="btn btn-primary" data-act="ok">Usar imagem</button>
        </div>
      </div>`;

    const finish = (blob) => {
      back.classList.add('closing');
      setTimeout(() => { back.remove(); URL.revokeObjectURL(url); }, 150);
      resolve(blob);
    };

    const imgEl = back.querySelector('.crop-img');
    const zoomEl = back.querySelector('#crop-zoom');

    let nw = 0, nh = 0, baseScale = 1, z = 1, ox = 0, oy = 0;
    const dispW = () => nw * baseScale * z;
    const dispH = () => nh * baseScale * z;
    const clamp = () => {
      ox = Math.min(0, Math.max(frameW - dispW(), ox));
      oy = Math.min(0, Math.max(frameH - dispH(), oy));
    };
    const apply = () => {
      clamp();
      imgEl.style.width = dispW() + 'px';
      imgEl.style.height = dispH() + 'px';
      imgEl.style.transform = `translate(${ox}px, ${oy}px)`;
    };

    img.onload = () => {
      nw = img.naturalWidth; nh = img.naturalHeight;
      baseScale = Math.max(frameW / nw, frameH / nh); // "cover"
      z = 1;
      ox = (frameW - dispW()) / 2;
      oy = (frameH - dispH()) / 2;
      imgEl.src = url;
      apply();
    };
    img.src = url;

    // zoom (mantém o centro)
    zoomEl.addEventListener('input', () => {
      const cx = (frameW / 2 - ox) / (dispW());
      const cy = (frameH / 2 - oy) / (dispH());
      z = parseFloat(zoomEl.value);
      ox = frameW / 2 - cx * dispW();
      oy = frameH / 2 - cy * dispH();
      apply();
    });

    // arrastar (pointer)
    let dragging = false, sx = 0, sy = 0, sox = 0, soy = 0;
    const stage = back.querySelector('.crop-stage');
    stage.addEventListener('pointerdown', (e) => { dragging = true; sx = e.clientX; sy = e.clientY; sox = ox; soy = oy; stage.setPointerCapture(e.pointerId); stage.classList.add('grabbing'); });
    stage.addEventListener('pointermove', (e) => { if (!dragging) return; ox = sox + (e.clientX - sx); oy = soy + (e.clientY - sy); apply(); });
    const endDrag = () => { dragging = false; stage.classList.remove('grabbing'); };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    back.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel' || e.target === back) return finish(null);
      if (act === 'ok') {
        const canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        const ctx = canvas.getContext('2d');
        const scale = baseScale * z;            // px exibidos por px-fonte
        const sx0 = -ox / scale;
        const sy0 = -oy / scale;
        const sw = frameW / scale;
        const sh = frameH / scale;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
        try { ctx.drawImage(img, sx0, sy0, sw, sh, 0, 0, outW, outH); } catch {}
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.9);
      }
    });
    document.addEventListener('keydown', function onKey(ev) {
      if (!document.body.contains(back)) { document.removeEventListener('keydown', onKey); return; }
      if (ev.key === 'Escape') finish(null);
    }, true);

    (document.querySelector('#modal-mount') || document.body).appendChild(back);
    requestAnimationFrame(() => back.classList.add('open'));
  });
}
