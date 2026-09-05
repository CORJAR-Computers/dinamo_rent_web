<script lang="ts">
  import '../app.css';
  import Navbar from '$lib/components/Navbar.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import BookingModal from '$lib/components/BookingModal.svelte';

  import { page } from '$app/state';

  let { children } = $props();

  let isAdmin = $derived(page.url.pathname.startsWith('/admin'));
</script>

{#if isAdmin}
  {@render children?.()}
{:else}
  <div class="flex flex-col min-h-screen bg-slate-950 text-slate-100 selection:bg-orange-500 selection:text-white">
    <Navbar />
    <main class="flex-1">
      {@render children?.()}
    </main>
    <Footer />
    <BookingModal />
  </div>
{/if}
