<script lang="ts">
	import { goto } from '$app/navigation';

	let password = $state('');
	let showPassword = $state(false);
	let loading = $state(false);
	let errorMsg = $state('');

	async function handleLogin(e: SubmitEvent) {
		e.preventDefault();
		if (!password.trim()) {
			errorMsg = 'Ingresa la contraseña de administración.';
			return;
		}

		loading = true;
		errorMsg = '';

		try {
			const res = await fetch('/api/admin/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password })
			});

			const data = await res.json();

			if (res.ok && data.ok) {
				goto('/admin/flota');
			} else {
				errorMsg = data.message || 'Contraseña incorrecta.';
			}
		} catch {
			errorMsg = 'Error al conectar con el servidor.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Acceso Administrativo | Dinamo Rent a Car</title>
</svelte:head>

<div class="max-w-md w-full mx-auto p-6">
	<!-- Logo / Header -->
	<div class="text-center space-y-3 mb-8">
		<div class="w-14 h-14 rounded-2xl bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-black text-2xl mx-auto shadow-xl shadow-orange-500/25">
			D
		</div>
		<h1 class="text-2xl font-black text-white tracking-tight">DINAMO RENT A CAR</h1>
		<p class="text-xs text-slate-400">Acceso exclusivo para administradores</p>
	</div>

	<!-- Login Card -->
	<div class="bg-slate-900/90 border border-slate-800 rounded-3xl p-7 shadow-2xl backdrop-blur-xl">
		<form onsubmit={handleLogin} class="space-y-5">
			{#if errorMsg}
				<div class="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2.5">
					<i class="fa-solid fa-triangle-exclamation shrink-0 text-sm"></i>
					<span>{errorMsg}</span>
				</div>
			{/if}

			<div class="space-y-2">
				<label for="admin-pass" class="block text-xs font-bold uppercase tracking-wider text-slate-300">
					Contraseña Maestra
				</label>
				<div class="relative">
					<input
						id="admin-pass"
						type={showPassword ? 'text' : 'password'}
						bind:value={password}
						placeholder="••••••••••••"
						autocomplete="current-password"
						class="w-full px-4 py-3 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-orange-500 transition-colors pr-11"
						required
					/>
					<button
						type="button"
						onclick={() => (showPassword = !showPassword)}
						class="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
						title={showPassword ? 'Ocultar' : 'Mostrar'}
					>
						<i class="fa-solid {showPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm"></i>
					</button>
				</div>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
			>
				{#if loading}
					<i class="fa-solid fa-circle-notch fa-spin"></i>
					<span>Verificando...</span>
				{:else}
					<i class="fa-solid fa-lock-open"></i>
					<span>Ingresar al Panel</span>
				{/if}
			</button>
		</form>

		<div class="mt-6 pt-5 border-t border-slate-800 text-center">
			<a href="/" class="text-xs text-slate-500 hover:text-slate-400 transition-colors">
				← Volver al sitio web principal
			</a>
		</div>
	</div>
</div>
