export function normalizeKenyanPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `254${digits.slice(1)}`;
  else if (!digits.startsWith("254") && digits.length === 9) digits = `254${digits}`;
  return digits;
}

export function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${normalizeKenyanPhone(phone)}?text=${encodeURIComponent(message)}`;
}

export function serviceContactMessage(service: string | null | undefined, area: string | null | undefined): string {
  return `Hello, I found you on MTAA SERVICES. I need help with ${service?.trim() || "a service"} in ${area?.trim() || "my area"}.`;
}

export function directionsUrl(destination: {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  areaName: string | null;
  county: string | null;
}): string | null {
  const hasCoordinates = destination.latitude !== null && destination.longitude !== null;
  const query = hasCoordinates
    ? `${destination.latitude},${destination.longitude}`
    : [destination.address, destination.areaName, destination.county].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : null;
}
