<script lang="ts">
  import { onMount } from 'svelte';
  import { booking } from '$lib/stores/bookingStore.svelte';

  let canvas = $state<HTMLCanvasElement | null>(null);
  let ctx: CanvasRenderingContext2D | null = null;
  let isDrawing = false;
  let hasSignature = $state(false);

  onMount(() => {
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = '#00D2FF'; // Neon cyan line for high contrast and tech feel
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  });

  function getCoordinates(e: MouseEvent | TouchEvent | PointerEvent): { x: number; y: number } {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else {
      const me = e as MouseEvent;
      return {
        x: me.clientX - rect.left,
        y: me.clientY - rect.top
      };
    }
  }

  function startDrawing(e: MouseEvent | TouchEvent | PointerEvent) {
    if (!ctx) return;
    if ('preventDefault' in e) e.preventDefault();
    isDrawing = true;
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: MouseEvent | TouchEvent | PointerEvent) {
    if (!isDrawing || !ctx) return;
    if ('preventDefault' in e) e.preventDefault();
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasSignature = true;
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    if (canvas && hasSignature) {
      booking.signatureDataUrl = canvas.toDataURL('image/png');
    }
  }

  function clearCanvas() {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    hasSignature = false;
    booking.signatureDataUrl = null;
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between text-xs text-slate-300">
    <span class="font-bold flex items-center gap-1.5 text-orange-400">
      <i class="fa-solid fa-signature"></i> Trazo de Firma Digital
    </span>
    {#if hasSignature}
      <span class="text-emerald-400 flex items-center gap-1 font-semibold text-[11px]">
        <i class="fa-solid fa-circle-check"></i> Firma Capturada
      </span>
    {:else}
      <span class="text-slate-400 text-[11px]">Firma con el dedo o mouse</span>
    {/if}
  </div>

  <!-- Canvas Box -->
  <div class="relative w-full h-44 rounded-2xl bg-slate-950 border-2 border-dashed border-slate-700 hover:border-cyan-500/60 transition-colors overflow-hidden flex items-center justify-center">
    <canvas
      bind:this={canvas}
      class="w-full h-full cursor-crosshair touch-none"
      onmousedown={startDrawing}
      onmousemove={draw}
      onmouseup={stopDrawing}
      onmouseleave={stopDrawing}
      onpointerdown={startDrawing}
      onpointermove={draw}
      onpointerup={stopDrawing}
      ontouchstart={startDrawing}
      ontouchmove={draw}
      ontouchend={stopDrawing}
    ></canvas>

    {#if !hasSignature}
      <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-600 space-y-1">
        <i class="fa-solid fa-pen-nib text-2xl text-slate-500"></i>
        <p class="text-xs font-medium">Firma aquí sobre la línea punteada</p>
      </div>
    {/if}

    <!-- Bottom guideline -->
    <div class="absolute bottom-6 left-8 right-8 border-b border-slate-800/80 pointer-events-none"></div>
  </div>

  <div class="flex items-center justify-between">
    <button
      type="button"
      onclick={clearCanvas}
      class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition flex items-center gap-1.5 cursor-pointer"
    >
      <i class="fa-solid fa-rotate-left text-[11px]"></i>
      <span>Borrar / Repetir</span>
    </button>
    <span class="text-[10px] text-slate-500">
      <i class="fa-solid fa-shield-halved text-cyan-400 mr-0.5"></i> Validez pre-contractual Ley 527/1999
    </span>
  </div>
</div>
