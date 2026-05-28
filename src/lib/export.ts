import type { Lead } from '../types';

export function leadsToCSV(leads: Lead[]): string {
  const headers = [
    'Business Name', 'Category', 'Address', 'Phone', 'Website',
    'Google Maps URL', 'Rating', 'Review Count', 'Hours',
    'Social Media', 'Plus Code', 'Price Level',
  ];

  const rows = leads.map((l) => [
    l.business_name,
    l.category,
    l.address,
    l.phone,
    l.website,
    l.google_maps_url,
    l.rating,
    l.review_count,
    l.hours,
    (l.social_media || []).join(' | '),
    l.extra_data?.plus_code || '',
    l.extra_data?.price_level || '',
  ]);

  const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  return lines.join('\r\n');
}

export function downloadCSV(leads: Lead[], filename = 'maps-leads.csv'): void {
  const blob = new Blob([leadsToCSV(leads)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJSON(leads: Lead[], filename = 'maps-leads.json'): void {
  const blob = new Blob([JSON.stringify(leads, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
