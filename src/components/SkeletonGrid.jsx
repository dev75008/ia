export default function SkeletonGrid({ count = 6 }) {
  return Array.from({ length: count }, (_, index) => <div className="skeleton" key={index} aria-hidden="true" />)
}
