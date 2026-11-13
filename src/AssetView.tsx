import { createContext, useContext, type CSSProperties, type JSX } from 'react';
import { ASSET_GAP, assetPicture } from './layout';
import { LabelText } from './LabelText';
import type { Asset } from './model';

/**
 * Hosts the user allowed to load images from, for this session. The canvas never contacts a
 * server on its own: code can come from a paste, and loading an image tells that server
 * the diagram was opened.
 */
export interface ImageConsent {
  allowed: ReadonlySet<string>;
  allow: (host: string) => void;
}

export const ImageConsentContext = createContext<ImageConsent>({ allowed: new Set(), allow: () => {} });

/** How an image URL may be shown: inline data, a remote host (needs consent), or never. */
export function imageSource(url: string): { kind: 'data' } | { kind: 'remote'; host: string } | { kind: 'blocked' } {
  if (/^data:image\//i.test(url)) return { kind: 'data' };
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return { kind: 'remote', host: parsed.host };
  } catch {
    // Not an absolute URL.
  }
  return { kind: 'blocked' };
}

function ImagePicture({ url, width, height, keepRatio }: { url: string; width: number; height: number; keepRatio: boolean }): JSX.Element {
  const consent = useContext(ImageConsentContext);
  const source = imageSource(url);
  const box: CSSProperties = { width, height };
  if (source.kind === 'data' || (source.kind === 'remote' && consent.allowed.has(source.host))) {
    return (
      <img
        className="asset-image"
        src={url}
        alt=""
        draggable={false}
        referrerPolicy="no-referrer"
        style={{ ...box, objectFit: keepRatio ? 'contain' : 'fill' }}
      />
    );
  }
  return (
    <span className="asset-placeholder" style={box} title={url}>
      {source.kind === 'remote' ? (
        <>
          <span className="asset-host">{source.host}</span>
          <button
            className="nodrag"
            title={`Load images from ${source.host} for this session`}
            onClick={(e) => {
              e.stopPropagation();
              consent.allow(source.host);
            }}
          >
            Load
          </button>
        </>
      ) : (
        <span className="asset-host">image</span>
      )}
    </span>
  );
}

/**
 * An icon or image node: the picture with its label above (`pos: t`) or below it.
 * Icons need an icon pack, which the app does not bundle: the canvas draws the background
 * (`form`) and the icon name.
 */
export function AssetView({ asset, label, markdown, labelStyle }: { asset: Asset; label: string; markdown: boolean; labelStyle: CSSProperties }): JSX.Element {
  const picture = assetPicture(asset);
  const labelFirst = asset.pos === 't';
  const text = label !== '' && (
    <span className="asset-label" style={labelStyle}>
      <LabelText text={label} markdown={markdown} />
    </span>
  );
  return (
    <span className="asset-node" style={{ gap: ASSET_GAP, flexDirection: labelFirst ? 'column-reverse' : 'column' }}>
      {asset.kind === 'icon' ? (
        <span className={`asset-icon form-${asset.form ?? 'none'}`} style={{ width: picture.width, height: picture.height }} title={`Icon ${asset.icon}`}>
          {/* The name without its pack prefix: `fa:user` shows `user`. */}
          <span className="asset-icon-name">{asset.icon.slice(asset.icon.indexOf(':') + 1)}</span>
        </span>
      ) : (
        <ImagePicture url={asset.img} width={picture.width} height={picture.height} keepRatio={asset.constraint === 'on'} />
      )}
      {text}
    </span>
  );
}
