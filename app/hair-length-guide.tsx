export default function HairLengthGuide({ className }: { className: string }) {
  return (
    <figure className={className}>
      <img src="/hair-length-guide.png" alt="Modelo com marcações dos comprimentos de cabelo P, M, G e EX." loading="lazy" />
      <figcaption aria-hidden="true">
        <span className="home-hair-guide home-hair-guide-p" />
        <span className="home-hair-size home-hair-size-p">P</span>
        <span className="home-hair-guide home-hair-guide-m" />
        <span className="home-hair-size home-hair-size-m">M</span>
        <span className="home-hair-guide home-hair-guide-g" />
        <span className="home-hair-size home-hair-size-g">G</span>
        <span className="home-hair-guide home-hair-guide-ex" />
        <span className="home-hair-size home-hair-size-ex">EX</span>
      </figcaption>
    </figure>
  );
}
