<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let { data, children } = $props();

	let loggingOut = $state(false);

	async function logout() {
		loggingOut = true;
		try {
			await fetch('/api/admin/logout', { method: 'POST' });
			goto('/admin/login');
		} catch (err) {
			console.error('Error cerrando sesión:', err);
		} finally {
			loggingOut = false;
		}
	}

	const navItems = [
		{ href: '/admin/flota', label: 'Gestión de Flota', icon: 'fa-solid fa-car' },
		{ href: '/admin/precios', label: 'Tarifas y Precios', icon: 'fa-solid fa-tags' },
		{ href: '/admin/reservas', label: 'Reservas Web', icon: 'fa-solid fa-calendar-check' }
	];
</script>

<svelte:head>
	<title>Panel de Administración | Dinamo Rent a Car</title>
</svelte:head>

{#if !data.authenticated}
	<!-- Pantalla de Login limpia sin barra lateral -->
	<div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center">
		{@render children()}
	</div>
{:else}
	<!-- Layout de Administración con Sidebar -->
	<div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
		
		<!-- Sidebar -->
		<aside class="w-full md:w-64 bg-slate-900/80 backdrop-blur-xl border-b md:border-b-0 md:border-r border-slate-800 flex flex-col shrink-0">
			<!-- Header / Brand -->
			<div class="p-5 border-b border-slate-800 flex items-center justify-between">
				<a href="/admin/flota" class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-xl bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-orange-500/20">
						D
					</div>
					<div>
						<h1 class="font-heading font-black text-base text-white tracking-tight leading-none">DINAMO RENT</h1>
						<span class="text-[10px] font-bold uppercase tracking-wider text-orange-400">Panel de Control</span>
					</div>
				</a>
			</div>

			<!-- Nav links -->
			<nav class="p-4 space-y-1.5 flex-1">
				{#each navItems as item}
					{@const active = page.url.pathname.startsWith(item.href)}
					<a
						href={item.href}
						class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all {active
							? 'bg-orange-500 text-white shadow-md shadow-orange-500/20 font-bold'
							: 'text-slate-400 hover:text-white hover:bg-slate-800/60'}"
					>
						<i class="{item.icon} w-4 text-center"></i>
						<span>{item.label}</span>
					</a>
				{/each}

				<div class="pt-4 mt-4 border-t border-slate-800/80">
					<a
						href="/"
						target="_blank"
						class="flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-orange-400 hover:bg-slate-800/40 transition-colors"
					>
						<i class="fa-solid fa-arrow-up-right-from-square w-4 text-center"></i>
						<span>Ver Web Pública</span>
					</a>
				</div>
			</nav>

			<!-- User & Logout Footer -->
			<div class="p-4 border-t border-slate-800 flex items-center justify-between">
				<div class="flex items-center gap-2 text-xs text-slate-400">
					<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
					<span class="font-medium">Administrador</span>
				</div>
				<button
					onclick={logout}
					disabled={loggingOut}
					class="text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
					title="Cerrar sesión"
				>
					<i class="fa-solid fa-right-from-bracket"></i>
					<span>Salir</span>
				</button>
			</div>
		</aside>

		<!-- Main Workspace Area -->
		<main class="flex-1 min-w-0 flex flex-col">
			{@render children()}
		</main>

	</div>
{/if}
