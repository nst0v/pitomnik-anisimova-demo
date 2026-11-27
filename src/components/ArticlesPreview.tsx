import { articles, featuredArticles } from '../data/articles'
import ArticleCard from './ArticleCard'

export default function ArticlesPreview() {
  return (
    <section className="articles-preview section" id="articles">
      <div className="container">
        <div className="section-heading articles-preview-heading">
          <div><p className="section-kicker">Записки садовода</p><h2>Знакомство с растением<br />начинается с истории</h2><p>Наблюдения, маленькие открытия и опыт выращивания редких растений. Авторские статьи Геннадия Павловича Анисимова.</p></div>
          <a className="button button-outline" href="#/articles">Все статьи <span>{articles.length}</span><span aria-hidden="true">↗</span></a>
        </div>
        <div className="article-preview-caption"><span>Из авторского архива</span><small>Опыт выращивания редких растений</small></div>
        <div className="articles-preview-grid">
          {featuredArticles.map((article, index) => <ArticleCard key={article.slug} article={article} featured={index === 0} />)}
        </div>
      </div>
    </section>
  )
}
