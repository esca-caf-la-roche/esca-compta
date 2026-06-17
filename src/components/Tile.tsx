import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface TileProps {
  title: string;
  description: string;
  icon: LucideIcon;
  to: string;
  colorClass: string;
}

export default function Tile({ title, description, icon: Icon, to, colorClass }: TileProps) {
  return (
    <Link to={to} className={`tile-card ${colorClass}`}>
      <div className="tile-icon-wrapper">
        <Icon className="tile-icon" size={32} />
      </div>
      <div className="tile-content">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="tile-hover-effect"></div>
    </Link>
  );
}
