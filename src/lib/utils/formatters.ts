export function formatCurrency(amount: number, currency: 'COP' | 'USD' = 'COP', usdRate = 4000): string {
  if (currency === 'USD') {
    const usd = Math.round(amount / usdRate);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(usd);
  }

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Formatea un instante ISO (fecha y hora) para mostrarlo al usuario,
 * en hora de Colombia y sin el formato ISO que devuelve la pasarela.
 */
export function formatDateTimePretty(dateString: string): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota'
  }).format(d);
}

export function formatDatePretty(dateString: string): string {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString('es-CO', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  return dateString;
}
