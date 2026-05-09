import { useEffect } from "react";

type SeoOpts = {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  type?: "website" | "article" | "profile";
  jsonLd?: object | object[];
  noIndex?: boolean;
};

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  if (!content) return;
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  if (!href) return;
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(id: string, data: object) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.text = JSON.stringify(data);
}

function clearJsonLd(id: string) {
  const el = document.getElementById(id);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

export function useSeo(opts: SeoOpts) {
  useEffect(() => {
    if (opts.title) document.title = opts.title;
    if (opts.description) {
      setMeta("description", opts.description);
      setMeta("og:description", opts.description, "property");
      setMeta("twitter:description", opts.description);
    }
    if (opts.title) {
      setMeta("og:title", opts.title, "property");
      setMeta("twitter:title", opts.title);
    }
    if (opts.canonical) {
      setLink("canonical", opts.canonical);
      setMeta("og:url", opts.canonical, "property");
    }
    if (opts.image) {
      setMeta("og:image", opts.image, "property");
      setMeta("twitter:image", opts.image);
    }
    setMeta("og:type", opts.type ?? "website", "property");
    setMeta("twitter:card", "summary_large_image");
    if (opts.noIndex) {
      setMeta("robots", "noindex,nofollow");
    } else {
      setMeta("robots", "index, follow, max-image-preview:large");
    }
    const ids: string[] = [];
    if (opts.jsonLd) {
      const arr = Array.isArray(opts.jsonLd) ? opts.jsonLd : [opts.jsonLd];
      arr.forEach((data, i) => {
        const id = `seo-jsonld-${i}`;
        ids.push(id);
        setJsonLd(id, data);
      });
    }
    return () => {
      ids.forEach(clearJsonLd);
    };
  }, [JSON.stringify(opts)]);
}

export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function titleCase(s: string): string {
  return (s || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
