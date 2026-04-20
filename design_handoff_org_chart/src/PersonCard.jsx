/* global React */
const { useState, useRef, useEffect } = React;

// A single person card. Sizes come from the parent (so tweaks can adjust density).
// Highlight states: 'dim' (other branches), 'focus' (hover/expanded), null (neutral).
function PersonCard({
  person,
  width,
  height,
  highlight,
  expanded,
  onHover,
  onLeave,
  onToggle,
  density, // 'compact' | 'standard' | 'comfy'
  showAccent,
}) {
  const color = window.PERSON_COLOR[person.slug] || window.PALETTE.fallback;
  const isRoot = person.reportsTo === null && person.slug === "yann-lecun";

  const compact = density === "compact";
  const comfy = density === "comfy";

  const bodyLines = comfy ? 3 : compact ? 0 : 2;
  const avatarSize = comfy ? 44 : compact ? 32 : 40;

  const dimmed = highlight === "dim";
  const focused = highlight === "focus";

  return (
    <div
      className={`pcard ${dimmed ? "pcard--dim" : ""} ${focused ? "pcard--focus" : ""} ${expanded ? "pcard--expanded" : ""}`}
      style={{
        width,
        minHeight: height,
        "--tile-a": color.a,
        "--tile-b": color.b,
        "--tile-ink": color.ink,
      }}
      onMouseEnter={() => onHover && onHover(person.slug)}
      onMouseLeave={() => onLeave && onLeave()}
      onClick={() => onToggle && onToggle(person.slug)}
    >
      {showAccent && <div className="pcard-accent" aria-hidden />}

      <div className="pcard-head">
        <div
          className="pcard-avatar"
          style={{ width: avatarSize, height: avatarSize, fontSize: avatarSize * 0.4 }}
        >
          {window.initials(person.name)}
        </div>

        <div className="pcard-headtext">
          <div className="pcard-name">{person.name}</div>
          <div className="pcard-role">{person.role}</div>
        </div>

        {isRoot && (
          <span className="pcard-crown" title="Executive Chairman" aria-hidden>
            ✦
          </span>
        )}
      </div>

      {!compact && (
        <div className="pcard-meta">
          <span className="pcard-loc">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.38 4.5 8.5 4.5 8.5s4.5-5.12 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.25a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5Z"
                fill="currentColor"
              />
            </svg>
            {person.location}
          </span>
          {person.tenure && <span className="pcard-tenure">{person.tenure}</span>}
        </div>
      )}

      {bodyLines > 0 && person.body && (
        <p
          className="pcard-body"
          style={{
            WebkitLineClamp: bodyLines,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {person.body}
        </p>
      )}

      {expanded && (
        <div className="pcard-expanded">
          <div className="pcard-expanded-body">{person.body}</div>
          <div className="pcard-actions">
            <a className="pcard-cta" href="#" onClick={(e) => e.preventDefault()}>
              View full profile →
            </a>
          </div>
        </div>
      )}

      <div className="pcard-hoverchip" aria-hidden>
        Click for profile →
      </div>
    </div>
  );
}

window.PersonCard = PersonCard;
