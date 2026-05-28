import { MapPin, Phone, Globe, Star, Clock, Share2, ExternalLink } from 'lucide-react';
import type { Lead } from '../types';

interface Props {
  lead: Lead;
}

export function LeadCard({ lead }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 text-xs hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800 text-sm leading-tight">{lead.business_name || '—'}</p>
          {lead.category && (
            <p className="text-slate-400 mt-0.5">{lead.category}</p>
          )}
        </div>
        {lead.rating && (
          <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">
            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
            <span className="text-amber-700 font-semibold">{lead.rating}</span>
            {lead.review_count && (
              <span className="text-amber-500">({lead.review_count})</span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1 text-slate-600">
        {lead.address && (
          <div className="flex items-start gap-1.5">
            <MapPin className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />
            <span className="leading-relaxed">{lead.address}</span>
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
            <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline">{lead.phone}</a>
          </div>
        )}
        {lead.website && (
          <div className="flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-slate-400 shrink-0" />
            <a
              href={lead.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline truncate max-w-[200px]"
            >
              {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          </div>
        )}
        {lead.hours && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{lead.hours}</span>
          </div>
        )}
      </div>

      {lead.social_media && lead.social_media.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Share2 className="w-3 h-3 text-slate-400" />
          {lead.social_media.map((url, i) => {
            const domain = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
            return (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded text-slate-600 transition-colors"
              >
                {domain}
              </a>
            );
          })}
        </div>
      )}

      {lead.google_maps_url && (
        <a
          href={lead.google_maps_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          View on Maps
        </a>
      )}
    </div>
  );
}
