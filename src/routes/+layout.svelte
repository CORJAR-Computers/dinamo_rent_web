<script lang="ts">
  import '../app.css';
  import Navbar from '#lib/components/Navbar.svelte';
  import Footer from '#lib/components/Footer.svelte';
  import BookingModal from '#lib/components/BookingModal.svelte';

  import { page } from '$app/state';

  let { children } = $props();
</script>

<!-- Se evalúa durante el render: un `$derived` se lee fuera del contexto de la
     petición tras un HMR y SvelteKit 3 lanza `state_read_outside_render`. -->
{#if page.url.pathname.startsWith('/admin')}
  {@render children?.()}
{:else}
  <div class="flex flex-col min-h-screen bg-slate-950 text-slate-100 selection:bg-orange-500 selection:text-white print:bg-white">
    <Navbar />
    <main class="flex-1">
      {@render children?.()}
    </main>
    <Footer />
    <BookingModal />
  </div>
{/if}
